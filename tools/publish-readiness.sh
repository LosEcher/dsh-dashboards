#!/bin/sh
# publish-readiness v1
#
# 每个仓库自带一份的机械门禁：判断"这个仓能不能从 dogfood 转对外"。
# 判据、分层与理由见同目录 README.md；每个失败项都带 remedy。
# canonical 源在此处，rollout 见同目录 install.sh；各仓 tools/ 下的副本自足可随仓发布。
#
# 用法:
#   tools/publish-readiness.sh [--repo DIR] [--conf FILE] [--json] [--quiet]
#                              [--no-self-test] [--version] [-h]
#
# 退出码: 0=全过(P1 告警不算失败) / 1=有 P0 失败 / 2=工具错误
#
# 设计纪律（都是付过学费的）:
#   * 不依赖调用者环境: 需要 git/gh 时按契约探测，缺失记 na + remedy，绝不静默算过
#   * 不用 `writer | grep -q`（pipefail 下 SIGPIPE 会伪装成"没命中"）: 先写文件再 grep
#   * 门禁自证: --self-test 用临时夹具注入假密钥/假 private:true，断言必红
#   * 脚本自身不得出现它要扫的字面量（用户名、密钥样式都运行时拼），否则自己咬自己

PR_VERSION="1"

PR_PASSED=0
PR_WARNED=0
PR_FAILED=0
PR_NA=0

# ---- 默认配置（conf 可覆盖；先给值，避免 set -u 下 source 报错） ----
REPO_DESC=""
PUBLISH_TARGET="1"             # 0 = 声明为内部仓/非发布目标：整体记 na 并 exit 0（不假装通过）
EXPECT_REMOTE="1"              # 1 = 必须有 git remote
EXPECT_VISIBILITY="any"        # any|public|private
IDENTITY_MODE="degraded"       # degraded(脚本/插件仓) | artifact(二进制/dmg 仓)
IDENTITY_ARTIFACT=""           # artifact 模式必填，glob，相对仓根
IDENTITY_NEEDLE="auto"         # auto = git 短修订
VERSION_FILE=""                # 空 = 自动探测 package.json / Cargo.toml
VERSION_FIELD=""
BREAKING_RECORD=""             # 相对仓根，如 docs/BREAKING.md
REQUIRE_BREAKING_RECORD="0"
HISTORY_SCAN="auto"            # auto|always|never
HISTORY_MAX_COMMITS="2000"
SELF_TEST="1"
EXTRA_LEAK_PATTERNS=""         # 空格分隔的额外正则
ALLOW_PATTERNS=""              # 空格分隔，命中即从结果里剔除
LOCAL_HOOK=""                  # 默认 tools/publish-readiness.local.sh

# ---- 参数 ----
PR_ROOT=""
PR_CONF=""
PR_JSON=0
PR_QUIET=0

usage() {
  cat <<'USAGE'
publish-readiness — 每个仓库自带的发布就绪门禁

用法: publish-readiness.sh [选项]

  --repo DIR       目标仓根（默认: 脚本在 tools/ 下则取上一级，否则取 cwd）
  --conf FILE      配置文件（默认: <repo>/tools/publish-readiness.conf）
  --json           额外输出一行机器可读 JSON
  --quiet          只输出失败/告警行
  --no-self-test   跳出门禁自证（负向控制）
  --version        打印版本
  -h, --help       本帮助

退出码: 0 全过 / 1 有 P0 失败 / 2 工具错误
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) PR_ROOT=$2; shift 2 ;;
    --conf) PR_CONF=$2; shift 2 ;;
    --json) PR_JSON=1; shift ;;
    --quiet) PR_QUIET=1; shift ;;
    --no-self-test) SELF_TEST=0; shift ;;
    --version) printf 'publish-readiness %s\n' "$PR_VERSION"; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'publish-readiness: 未知参数 %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

# ---- 定位仓根 ----
if [ -z "$PR_ROOT" ]; then
  self_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 2
  if [ "$(basename -- "$self_dir")" = "tools" ]; then
    PR_ROOT=$(CDPATH= cd -- "$self_dir/.." && pwd) || exit 2
  else
    PR_ROOT=$(pwd)
  fi
fi
[ -d "$PR_ROOT" ] || { printf 'publish-readiness: 仓根不是目录: %s\n' "$PR_ROOT" >&2; exit 2; }
PR_ROOT=$(CDPATH= cd -- "$PR_ROOT" && pwd) || exit 2

[ -n "$PR_CONF" ] || PR_CONF="$PR_ROOT/tools/publish-readiness.conf"

TMPD=$(mktemp -d "${TMPDIR:-/tmp}/publish-readiness.XXXXXX") || exit 2
cleanup() { rm -rf "$TMPD"; }
trap cleanup EXIT HUP INT TERM

: > "$TMPD/report.tsv"

# ---- 报告 ----
report() { # level(FAIL|WARN|PASS|NA) id detail remedy
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$TMPD/report.tsv"
  case "$1" in
    FAIL) PR_FAILED=$((PR_FAILED + 1)) ;;
    WARN) PR_WARNED=$((PR_WARNED + 1)) ;;
    PASS) PR_PASSED=$((PR_PASSED + 1)) ;;
    NA)   PR_NA=$((PR_NA + 1)) ;;
  esac
  if [ "$PR_QUIET" -eq 1 ]; then
    case "$1" in
      PASS) return 0 ;;
    esac
  fi
  # 只有 FAIL/WARN 才把 remedy 打出来，PASS/NA 的 remedy 是给 JSON 用的
  case "$1" in
    FAIL) printf 'FAIL  %-26s %s\n' "$2" "$3"; [ -n "$4" ] && printf '      → %s\n' "$4" ;;
    WARN) printf 'WARN  %-26s %s\n' "$2" "$3"; [ -n "$4" ] && printf '      → %s\n' "$4" ;;
    NA)   printf 'na    %-26s %s\n' "$2" "$3" ;;
    PASS) printf 'ok    %-26s %s\n' "$2" "$3" ;;
  esac
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

# 按契约探测外部工具：PATH 之外还要查常见落点。
# 理由：本机 gh 在 /opt/homebrew/bin，非交互 shell 的 PATH 里没有——
# 只查 `command -v` 会让判据静默失效（记 na 而不是真的查过）。
resolve_bin() { # name -> 打印绝对路径；找不到返回 1
  if command -v "$1" >/dev/null 2>&1; then
    command -v "$1"
    return 0
  fi
  for _d in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin" "$HOME/.cargo/bin" /usr/bin /bin; do
    if [ -x "$_d/$1" ]; then
      printf '%s\n' "$_d/$1"
      return 0
    fi
  done
  return 1
}

# ---- 配置 ----
if [ -f "$PR_CONF" ]; then
  # conf 是目标仓自己的受信文件，直接 source（值里的空格/引号按 shell 规则写）
  # shellcheck disable=SC1090
  . "$PR_CONF"
fi
[ -n "$LOCAL_HOOK" ] || LOCAL_HOOK="$PR_ROOT/tools/publish-readiness.local.sh"

# ---- 泄漏/密钥模式（运行时构造，避免脚本自身命中自己的判据） ----
build_patterns() {
  # 高信号密钥样式
  cat > "$TMPD/secret.pat" <<'PAT'
sk-[A-Za-z0-9_-]{20,}
ghp_[A-Za-z0-9]{30,}
github_pat_[A-Za-z0-9_]{50,}
AKIA[0-9A-Z]{16}
xox[baprs]-[A-Za-z0-9-]{10,}
-----BEGIN [A-Z ]*PRIVATE KEY-----
(api[_-]?key|apikey|secret|token|passwd|password)[\"' ]*[:=][\"' ]*[A-Za-z0-9/+_-]{32,}
PAT

  # 本地路径/内网痕迹：用户名与家目录运行时取，不写字面量
  _user=$(id -un 2>/dev/null || printf '')
  {
    [ -n "$HOME" ] && printf '%s/\n' "$HOME"
    [ -n "$_user" ] && printf '/Users/%s/\n/home/%s/\n' "$_user" "$_user"
    printf '192\\.168\\.[0-9]+\\.\n'
    printf '100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\.[0-9]+\\.\n'
  } > "$TMPD/leak.pat"

  if [ -n "$EXTRA_LEAK_PATTERNS" ]; then
    for _p in $EXTRA_LEAK_PATTERNS; do printf '%s\n' "$_p" >> "$TMPD/leak.pat"; done
  fi

  : > "$TMPD/allow.pat"
  if [ -n "$ALLOW_PATTERNS" ]; then
    for _p in $ALLOW_PATTERNS; do printf '%s\n' "$_p" >> "$TMPD/allow.pat"; done
  fi
}

filter_allow() { # infile outfile
  if [ -s "$TMPD/allow.pat" ]; then
    grep -vE -f "$TMPD/allow.pat" "$1" > "$2" 2>/dev/null || : > "$2"
  else
    cp "$1" "$2"
  fi
}

# 排除门禁自身文件：它是判据的定义，扫它会自咬
GIT_EXCLUDES=':(exclude,glob)**/publish-readiness.sh'
GIT_EXCLUDES="$GIT_EXCLUDES :(exclude,glob)**/publish-readiness.conf"
GIT_EXCLUDES="$GIT_EXCLUDES :(exclude,glob)**/publish-readiness.local.sh"

# shellcheck disable=SC2086
git_grep_pat() { # patternfile outfile
  git -C "$PR_ROOT" grep -I -n -E -i -f "$1" -- . $GIT_EXCLUDES > "$2" 2>/dev/null || : > "$2"
}

show_head() { # file limit
  sed -n "1,${2}p" "$1" | sed 's/^/        /'
}

show_top_files() { # file  （命中按文件聚合，避免几百行明细淹没结论）
  _total=$(wc -l < "$1" | tr -d ' ')
  [ "$_total" -gt 10 ] || return 0
  printf '        —— 命中文件 Top%d（共 %s 处）——\n' 5 "$_total"
  cut -d: -f1 "$1" | sort | uniq -c | sort -rn | head -5 | sed 's/^/        /'
}

# ================= P0 =================

p0_repo_boundary() {
  if ! have_cmd git; then
    report NA "P0-0 仓边界" "git 缺失，无法判定" "安装 git 后重跑"
    return
  fi
  _top=$(git -C "$PR_ROOT" rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$_top" ]; then
    report FAIL "P0-0 仓边界" "不是 git 仓" "git init，或用 --repo 指到真正的仓根"
    return
  fi
  _top=$(CDPATH= cd -- "$_top" 2>/dev/null && pwd)
  if [ "$_top" = "$PR_ROOT" ]; then
    report PASS "P0-0 仓边界" "PR_ROOT 就是 git 根" ""
  else
    report FAIL "P0-0 仓边界" "PR_ROOT 不是 git 根（真根=$_top）" "本门禁以 git 根为判定边界；副本要放到真正的仓根 tools/ 下，否则扫的是父仓、结论无意义"
  fi
}

p0_secrets() {
  if ! have_cmd git; then
    report NA "P0-1 秘密泄漏" "git 缺失，无法扫描" "安装 git 后重跑"
    return
  fi
  if ! git -C "$PR_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    report NA "P0-1 秘密泄漏" "不是 git 仓，无法扫描历史" "在 git 仓内运行，或先 git init"
    return
  fi

  git_grep_pat "$TMPD/secret.pat" "$TMPD/secret_wt.raw"
  filter_allow "$TMPD/secret_wt.raw" "$TMPD/secret_wt.txt"
  _n=$(wc -l < "$TMPD/secret_wt.txt" | tr -d ' ')

  _hist_n=0
  if [ "$HISTORY_SCAN" != "never" ]; then
    git -C "$PR_ROOT" log -p --all --no-color -n "$HISTORY_MAX_COMMITS" > "$TMPD/hist.txt" 2>/dev/null || : > "$TMPD/hist.txt"
    grep -nE -i -f "$TMPD/secret.pat" "$TMPD/hist.txt" > "$TMPD/secret_hist.raw" 2>/dev/null || : > "$TMPD/secret_hist.raw"
    filter_allow "$TMPD/secret_hist.raw" "$TMPD/secret_hist.txt"
    _hist_n=$(wc -l < "$TMPD/secret_hist.txt" | tr -d ' ')
  fi

  if [ "$_n" -gt 0 ]; then
    report FAIL "P0-1 秘密泄漏" "工作树命中 $_n 处" "删除并轮换该凭据，然后 git rm；确认是测试夹具则加进 ALLOW_PATTERNS"
    show_head "$TMPD/secret_wt.txt" 10
    show_top_files "$TMPD/secret_wt.txt"
  elif [ "$_hist_n" -gt 0 ]; then
    report FAIL "P0-1 秘密泄漏" "历史命中 $_hist_n 处（工作树干净）" "凭据必须轮换（改写历史不算修复）；用 git filter-repo 清理后再推"
    show_head "$TMPD/secret_hist.txt" 10
    show_top_files "$TMPD/secret_hist.txt"
  else
    report PASS "P0-1 秘密泄漏" "工作树 + 最近 $HISTORY_MAX_COMMITS 提交无命中" ""
  fi
}

p0_path_leak() {
  # depends: build_patterns 已建 leak.pat
  if ! have_cmd git; then
    report NA "P0-2 本地路径/内网泄漏" "git 缺失" "安装 git 后重跑"
    return
  fi
  git_grep_pat "$TMPD/leak.pat" "$TMPD/leak_wt.raw"
  filter_allow "$TMPD/leak_wt.raw" "$TMPD/leak_wt.txt"
  _n=$(wc -l < "$TMPD/leak_wt.txt" | tr -d ' ')
  if [ "$_n" -gt 0 ]; then
    report FAIL "P0-2 本地路径/内网泄漏" "命中 $_n 处（家目录/内网地址）" "改成占位符或环境变量；示例文档用 \$HOME 或 <user>；确需保留则加 ALLOW_PATTERNS"
    show_head "$TMPD/leak_wt.txt" 10
    show_top_files "$TMPD/leak_wt.txt"
  else
    report PASS "P0-2 本地路径/内网泄漏" "未命中家目录/内网地址" ""
  fi
}

p0_license_privacy() {
  _lic=$(find "$PR_ROOT" -maxdepth 1 -iname 'licen[cs]e*' -o -maxdepth 1 -iname 'copying*' 2>/dev/null | head -1)
  if [ -n "$_lic" ]; then
    report PASS "P0-3a LICENSE" "存在 $(basename "$_lic")" ""
  else
    report FAIL "P0-3a LICENSE" "仓根无 LICENSE/COPYING" "加一个 LICENSE 文件（对外发布的前置条件）"
  fi

  _priv=""
  if [ -f "$PR_ROOT/package.json" ] && grep -qE '"private"[[:space:]]*:[[:space:]]*true' "$PR_ROOT/package.json" 2>/dev/null; then
    _priv="package.json 有 \"private\": true"
  fi
  if [ -f "$PR_ROOT/Cargo.toml" ] && grep -qE '^[[:space:]]*publish[[:space:]]*=[[:space:]]*false' "$PR_ROOT/Cargo.toml" 2>/dev/null; then
    _priv="${_priv}${_priv:+; }Cargo.toml 有 publish = false"
  fi
  if [ -n "$_priv" ]; then
    report FAIL "P0-3b 发布开关" "$_priv" "去掉 private/publish=false（保留则外部装不上）"
  else
    report PASS "P0-3b 发布开关" "无 private/publish=false" ""
  fi

  case "$EXPECT_VISIBILITY" in
    public|private)
      GH_BIN=$(resolve_bin gh) || {
        report NA "P0-3c 仓可见性" "找不到 gh（PATH 与常见落点都没有）" "装 gh 并 gh auth login，或把 EXPECT_VISIBILITY 设为 any"
        return
      }
      _slug=$(git -C "$PR_ROOT" remote get-url origin 2>/dev/null | sed -e 's#^.*github\.com[:/]##' -e 's#\.git$##')
      case "$_slug" in
        */*) : ;;
        *) report NA "P0-3c 仓可见性" "origin 不是 GitHub 远端" "把 EXPECT_VISIBILITY 设为 any，或配置 GitHub origin" ; return ;;
      esac
      _vis=$("$GH_BIN" repo view "$_slug" --json visibility -q .visibility 2>/dev/null | tr 'A-Z' 'a-z')
      if [ -z "$_vis" ]; then
        report NA "P0-3c 仓可见性" "gh 查询失败（$_slug）" "确认 gh 已登录且有该仓权限"
      elif [ "$_vis" = "$EXPECT_VISIBILITY" ]; then
        report PASS "P0-3c 仓可见性" "$_slug = $_vis（$GH_BIN）" ""
      else
        report FAIL "P0-3c 仓可见性" "$_slug = $_vis，期望 $EXPECT_VISIBILITY" "gh repo edit $_slug --visibility $EXPECT_VISIBILITY --accept-visibility-change-consequences"
      fi
      ;;
    *) report NA "P0-3c 仓可见性" "未声明期望（EXPECT_VISIBILITY=any）" "要盯就设 public/private" ;;
  esac
}

p0_remote() {
  if [ "$EXPECT_REMOTE" != "1" ] && [ "$EXPECT_REMOTE" != "true" ]; then
    report NA "P0-3d 远端" "未要求（EXPECT_REMOTE=0）" ""
    return
  fi
  if ! have_cmd git; then
    report NA "P0-3d 远端" "git 缺失" "安装 git 后重跑"
    return
  fi
  _r=$(git -C "$PR_ROOT" remote 2>/dev/null | head -1)
  if [ -n "$_r" ]; then
    report PASS "P0-3d 远端" "remote=$_r" ""
  else
    report FAIL "P0-3d 远端" "无 git remote" "git remote add origin <url>；无远端的仓既发布不了，身份也无从证明"
  fi
}

p0_identity() {
  # 版本
  _vf="$VERSION_FILE"
  if [ -z "$_vf" ]; then
    if [ -f "$PR_ROOT/package.json" ]; then _vf="package.json"
    elif [ -f "$PR_ROOT/Cargo.toml" ]; then _vf="Cargo.toml"
    fi
  fi
  _ver=""
  if [ -n "$_vf" ] && [ -f "$PR_ROOT/$_vf" ]; then
    case "$_vf" in
      *.json) _ver=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PR_ROOT/$_vf" | head -1) ;;
      *.toml) _ver=$(sed -n 's/^[[:space:]]*version[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$PR_ROOT/$_vf" | head -1) ;;
      *) _ver=$(sed -n 's/.*version[^0-9]*\([0-9][^"'"'"' ]*\).*/\1/p' "$PR_ROOT/$_vf" | head -1) ;;
    esac
  fi
  if [ -n "$_ver" ]; then
    report PASS "P0-4a 版本号" "$_vf = $_ver" ""
  else
    report WARN "P0-4a 版本号" "未声明版本（$_vf）" "在 package.json/Cargo.toml 里声明 version"
  fi

  # HEAD 是否落在 tag 上
  if have_cmd git && git -C "$PR_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    _attag=$(git -C "$PR_ROOT" tag --points-at HEAD 2>/dev/null | head -1)
    _anytag=$(git -C "$PR_ROOT" tag 2>/dev/null | head -1)
    if [ -n "$_attag" ]; then
      report PASS "P0-4b HEAD/tag" "HEAD 在 tag $_attag 上" ""
    elif [ -n "$_anytag" ]; then
      report WARN "P0-4b HEAD/tag" "HEAD 未打 tag（仓内有 tag）" "发布时 git tag v$_ver"
    else
      report NA "P0-4b HEAD/tag" "仓内无 tag" "首发后再看"
    fi
  fi

  # 身份面：artifact 模式查包内修订，degraded 模式只认版本+tag
  case "$IDENTITY_MODE" in
    artifact)
      if [ -z "$IDENTITY_ARTIFACT" ]; then
        report FAIL "P0-4c 包内身份" "IDENTITY_MODE=artifact 但未设 IDENTITY_ARTIFACT" "在 conf 里给出产物 glob"
        return
      fi
      _needle="$IDENTITY_NEEDLE"
      if [ "$_needle" = "auto" ]; then
        _needle=$(git -C "$PR_ROOT" rev-parse --short HEAD 2>/dev/null)
      fi
      _hit=""
      for _a in $PR_ROOT/$IDENTITY_ARTIFACT; do
        [ -f "$_a" ] || continue
        if grep -qa -- "$_needle" "$_a" 2>/dev/null; then _hit="$_a"; break; fi
      done
      if [ -n "$_hit" ]; then
        report PASS "P0-4c 包内身份" "产物含 $_needle（$(basename "$_hit")）" ""
      else
        report FAIL "P0-4c 包内身份" "未在产物里找到修订 $_needle" "构建时把 CANTOOL_BUILD_PIN_REVISION/COMMIT 之类烘进二进制，再重出包"
      fi
      ;;
    degraded)
      report NA "P0-4c 包内身份" "已降级（脚本/插件仓无产物可 grep）" "真出二进制时把 IDENTITY_MODE 改 artifact 并给 IDENTITY_ARTIFACT"
      ;;
    *) report FAIL "P0-4c 包内身份" "未知 IDENTITY_MODE=$IDENTITY_MODE" "取 degraded 或 artifact" ;;
  esac
}

p0_breaking_record() {
  if [ -z "$BREAKING_RECORD" ]; then
    report NA "P0-5 破坏性变更记录" "未声明 BREAKING_RECORD" "有对外接口后设 BREAKING_RECORD=docs/BREAKING.md"
    return
  fi
  _f="$PR_ROOT/$BREAKING_RECORD"
  if [ ! -f "$_f" ]; then
    if [ "$REQUIRE_BREAKING_RECORD" = "1" ]; then
      report FAIL "P0-5 破坏性变更记录" "$BREAKING_RECORD 不存在（REQUIRE=1）" "建该文件，每条破坏性变更写 what/affected/basis/migration"
    else
      report NA "P0-5 破坏性变更记录" "$BREAKING_RECORD 不存在" "建该文件后再纳入门禁"
    fi
    return
  fi
  # 每条空行分隔的块必须有四个字段
  awk -v RS='' '
    /[^[:space:]]/ {
      n++
      if ($0 !~ /what:/)      { miss[n]=miss[n] " what" }
      if ($0 !~ /affected:/)  { miss[n]=miss[n] " affected" }
      if ($0 !~ /basis:/)     { miss[n]=miss[n] " basis" }
      if ($0 !~ /migration:/) { miss[n]=miss[n] " migration" }
    }
    END {
      bad=0
      for (i=1;i<=n;i++) if (miss[i] != "") { printf "entry %d missing:%s\n", i, miss[i]; bad++ }
      if (bad>0) exit 1
      printf "entries=%d all well-formed\n", n
      exit 0
    }
  ' "$_f" > "$TMPD/breaking.txt" 2>&1
  if [ $? -eq 0 ]; then
    report PASS "P0-5 破坏性变更记录" "$(cat "$TMPD/breaking.txt")" ""
  else
    report FAIL "P0-5 破坏性变更记录" "条目缺字段（缺 basis = 未评估）" "每条补齐 what / affected(n) / basis(怎么量的) / migration"
    show_head "$TMPD/breaking.txt" 8
  fi
}

p0_self_test() {
  if [ "$SELF_TEST" != "1" ] && [ "$SELF_TEST" != "true" ]; then
    report NA "P0-6 门禁自证" "已用 --no-self-test 跳过" "CI 里应打开；本地调试可跳"
    return
  fi
  if ! have_cmd git; then
    report NA "P0-6 门禁自证" "git 缺失，无法造夹具" "安装 git 后重跑"
    return
  fi
  _st="$TMPD/selftest"
  mkdir -p "$_st" || { report NA "P0-6 门禁自证" "夹具目录创建失败" ""; return; }
  git -C "$_st" init -q >/dev/null 2>&1 || { report NA "P0-6 门禁自证" "git init 失败" ""; return; }
  git -C "$_st" config user.email t@example.invalid
  git -C "$_st" config user.name t
  printf 'clean fixture\n\n%s\n' "占位说明文本，长度足够让 README 检查通过。" > "$_st/README.md"
  printf 'MIT\n' > "$_st/LICENSE"
  printf '{"name":"fixture","version":"0.0.1"}\n' > "$_st/package.json"
  git -C "$_st" add -A >/dev/null 2>&1
  git -C "$_st" commit -qm init >/dev/null 2>&1

  # 干净夹具：不该因为 P0-1/P0-3b 红（其他项允许红/na）
  sh "$0" --repo "$_st" --conf /dev/null --no-self-test --quiet > "$TMPD/st_clean.txt" 2>&1 || :

  # 注入假密钥（拼接构造，脚本自身不含该字面量）
  _fake="sk-$(printf 'abcdefghijklmnopqrstuvwx')"
  printf 'token = "%s"\n' "$_fake" > "$_st/leak.txt"
  git -C "$_st" add -A >/dev/null 2>&1
  git -C "$_st" commit -qm leak >/dev/null 2>&1
  sh "$0" --repo "$_st" --conf /dev/null --no-self-test --quiet > "$TMPD/st_secret.txt" 2>&1 || :

  # 注入 private:true
  printf '{"name":"fixture","version":"0.0.1","private":true}\n' > "$_st/package.json"
  rm -f "$_st/leak.txt"
  git -C "$_st" add -A >/dev/null 2>&1
  git -C "$_st" commit -qm priv >/dev/null 2>&1
  sh "$0" --repo "$_st" --conf /dev/null --no-self-test --quiet > "$TMPD/st_priv.txt" 2>&1 || :

  # 注入 artifact 身份：正确修订 → ok；错误修订 → FAIL
  mkdir -p "$_st/tools" "$_st/dist"
  printf 'IDENTITY_MODE=artifact\nIDENTITY_ARTIFACT="dist/*"\n' > "$_st/tools/publish-readiness.conf"
  printf '{"name":"fixture","version":"0.0.1"}\n' > "$_st/package.json"
  _rev=$(git -C "$_st" rev-parse --short HEAD 2>/dev/null)
  printf 'built-from %s\n' "$_rev" > "$_st/dist/artifact.bin"
  # 这一跑不能加 --quiet：正向控制要抓的就是 PASS 行
  sh "$0" --repo "$_st" --no-self-test > "$TMPD/st_id_ok.txt" 2>&1 || :
  printf 'built-from 0000000\n' > "$_st/dist/artifact.bin"
  sh "$0" --repo "$_st" --no-self-test --quiet > "$TMPD/st_id_bad.txt" 2>&1 || :

  _ok=1
  if ! grep -qE '^FAIL[[:space:]]+P0-1' "$TMPD/st_secret.txt"; then _ok=0; fi
  if ! grep -qE '^FAIL[[:space:]]+P0-3b' "$TMPD/st_priv.txt"; then _ok=0; fi
  if grep -qE '^FAIL[[:space:]]+P0-1' "$TMPD/st_clean.txt"; then _ok=0; fi
  if grep -qE '^FAIL[[:space:]]+P0-3b' "$TMPD/st_clean.txt"; then _ok=0; fi
  if ! grep -qE '^ok[[:space:]]+P0-4c' "$TMPD/st_id_ok.txt"; then _ok=0; fi
  if ! grep -qE '^FAIL[[:space:]]+P0-4c' "$TMPD/st_id_bad.txt"; then _ok=0; fi

  if [ "$_ok" -eq 1 ]; then
    report PASS "P0-6 门禁自证" "负向控制 4/4 咬得住：假密钥、假 private、错修订必红；干净夹具与正确修订不误报" ""
  else
    report FAIL "P0-6 门禁自证" "负向控制未按预期工作" "门禁已失去咬合力：查 secret.pat / private / IDENTITY 判据是否被改坏"
  fi
}

# ================= P1（告警，不挡） =================

p1_readme() {
  if [ ! -f "$PR_ROOT/README.md" ]; then
    report WARN "P1-1 README" "无 README.md" "写一份：这是什么/怎么装/怎么配/怎么验"
    return
  fi
  _c=$(wc -c < "$PR_ROOT/README.md" | tr -d ' ')
  if [ "$_c" -ge 400 ]; then
    report PASS "P1-1 README" "$_c 字节" ""
  else
    report WARN "P1-1 README" "仅 $_c 字节，外部用户看不懂" "补：用途/安装/配置项/验证命令"
  fi
}

p1_gitignore() {
  if [ ! -f "$PR_ROOT/.gitignore" ]; then
    report WARN "P1-2 .gitignore" "无 .gitignore" "至少忽略 .publish-readiness/（门禁台账）与构建产物"
    return
  fi
  if grep -q 'publish-readiness' "$PR_ROOT/.gitignore" 2>/dev/null; then
    report PASS "P1-2 .gitignore" "已忽略门禁台账" ""
  else
    report WARN "P1-2 .gitignore" "未忽略 .publish-readiness/（台账会进提交）" "echo '.publish-readiness/' >> .gitignore"
  fi
}

p1_docs() {
  if [ -d "$PR_ROOT/docs" ] || [ -f "$PR_ROOT/CHANGELOG.md" ] || [ -f "$PR_ROOT/AGENTS.md" ]; then
    report PASS "P1-3 文档" "有 docs/ 或 CHANGELOG/AGENTS" ""
  else
    report WARN "P1-3 文档" "无 docs/CHANGELOG/AGENTS" "对外前补一份变更记录或设计说明"
  fi
}

# ================= 汇总 =================

emit_json() {
  _status="pass"
  [ "$PR_FAILED" -gt 0 ] && _status="fail"
  printf '{"gate":"publish-readiness","version":"%s","repo":"%s","status":"%s","passed":%s,"warned":%s,"failed":%s,"na":%s}\n' \
    "$PR_VERSION" "$PR_ROOT" "$_status" "$PR_PASSED" "$PR_WARNED" "$PR_FAILED" "$PR_NA"
}

ledger_write() {
  # 只在真正的 git 根写台账：PR_ROOT 不是根时写进去等于污染父仓的子目录
  if have_cmd git; then
    _top=$(git -C "$PR_ROOT" rev-parse --show-toplevel 2>/dev/null)
    _top=$(CDPATH= cd -- "$_top" 2>/dev/null && pwd)
    [ -n "$_top" ] && [ "$_top" != "$PR_ROOT" ] && return 0
  fi
  _dir="$PR_ROOT/.publish-readiness"
  mkdir -p "$_dir" 2>/dev/null || return 0
  _ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  _rev=""
  if have_cmd git; then _rev=$(git -C "$PR_ROOT" rev-parse --short HEAD 2>/dev/null); fi
  _status="pass"; [ "$PR_FAILED" -gt 0 ] && _status="fail"
  printf '{"ts":"%s","gate":"publish-readiness","version":"%s","rev":"%s","status":"%s","passed":%s,"warned":%s,"failed":%s,"na":%s}\n' \
    "$_ts" "$PR_VERSION" "$_rev" "$_status" "$PR_PASSED" "$PR_WARNED" "$PR_FAILED" "$PR_NA" \
    >> "$_dir/runs.jsonl" 2>/dev/null || :
}

main() {
  printf 'publish-readiness v%s  repo=%s\n' "$PR_VERSION" "$PR_ROOT"
  [ -f "$PR_CONF" ] && printf 'conf=%s\n' "$PR_CONF" || printf 'conf=(无)\n'
  printf '\n'

  # 非发布目标仓：不假装通过，也不假装失败——整仓记 na 并正常退出
  if [ "$PUBLISH_TARGET" != "1" ] && [ "$PUBLISH_TARGET" != "true" ]; then
    report NA "GATE" "本仓声明为内部仓（PUBLISH_TARGET=0），发布门禁不适用" "转为对外时把 conf 的 PUBLISH_TARGET 改回 1"
    printf '\n'
    printf '结论: NA — 非发布目标仓，未做发布判据\n'
    if [ "$PR_JSON" -eq 1 ]; then emit_json; fi
    ledger_write
    return 0
  fi

  build_patterns

  p0_repo_boundary
  p0_secrets
  p0_path_leak
  p0_license_privacy
  p0_remote
  p0_identity
  p0_breaking_record
  p0_self_test

  printf '\n'
  p1_readme
  p1_gitignore
  p1_docs

  # 仓自带扩展点
  if [ -f "$LOCAL_HOOK" ]; then
    printf '\n'
    # shellcheck disable=SC1090
    . "$LOCAL_HOOK"
  fi

  printf '\n'
  if [ "$PR_FAILED" -gt 0 ]; then
    printf '结论: FAIL — P0 失败 %s 项，告警 %s 项，na %s 项\n' "$PR_FAILED" "$PR_WARNED" "$PR_NA"
  else
    printf '结论: PASS — P0 全过，告警 %s 项，na %s 项\n' "$PR_WARNED" "$PR_NA"
  fi
  printf '台账: %s/.publish-readiness/runs.jsonl\n' "$PR_ROOT"

  if [ "$PR_JSON" -eq 1 ]; then emit_json; fi
  ledger_write

  if [ "$PR_FAILED" -gt 0 ]; then return 1; fi
  return 0
}

main
exit $?
