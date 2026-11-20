#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ゴルフ攻略アプリの自動テスト（これ1本で全部回す）

使い方（リポジトリのいちばん上のフォルダで実行）:

    python3 tests/run_tests.py              # 全部のテスト
    python3 tests/run_tests.py gps demo     # 名前に gps か demo を含むテストだけ
    python3 tests/run_tests.py --list       # テストの名前を一覧

必要なもの:  pip install playwright  →  python3 -m playwright install chromium

しくみ:
  ・このフォルダの1つ上（index.html がある場所）を、テスト用の小さなWebサーバーで配信する。
  ・画面を出さないブラウザ（Chromium）でスマホ幅の画面を開き、ボタンを押して結果を確かめる。
  ・位置情報は、にせものの緯度・経度をブラウザに渡して再現する。
  ・版番号は js/version.js から読む（テストの中に版番号を書かない）。
  ・ツインレイクスの画像の合言葉は、環境変数 IMG_PASS があるときだけ確かめる
    （合言葉はリポジトリに置かない決まりのため）。
  ・git（ファイルの変更履歴を管理する道具）の管理下にあるときは、「ファイルを直したのに
    版を上げ忘れていないか」も確かめる。くらべる相手は、環境変数 BASE_SHA（前に公開した時点）。
    無ければ、直前の記録（コミット）とくらべる。

失敗が1つでもあると、終了コード1で終わる（自動公開の仕組みが止まる）。
GitHub の中（環境変数 CI がある）で動かすときだけ、失敗した場面を1回やり直す
（GitHub のコンピューターは遅いことがあり、待ち時間が足りずに落ちる場合があるため）。
やり直して通った場面は、最後に名前を出す。手元では、やり直さない。
"""
import datetime
import functools
import http.server
import json
import os
import re
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.environ.get("APP_ROOT") or os.path.join(os.path.dirname(__file__), ".."))
SHOTS = os.environ.get("SHOT_DIR")  # 画面の写真を残したいときのフォルダ（任意）


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf8") as f:
        return f.read()


def find(pattern, text, default=None):
    m = re.search(pattern, text)
    return m.group(1) if m else default


# ---- アプリの版と保存場所の名前を、ソースから読む -------------------------------
_ver_src = read("js/version.js")
VER = find(r'APP_VER\s*=\s*"([^"]+)"', _ver_src)
APP_DATE = find(r'APP_DATE\s*=\s*"([^"]+)"', _ver_src)
APP_NAME = find(r'APP_NAME\s*=\s*"([^"]+)"', _ver_src)
_core_src = read("js/core.js")
KEY = find(r'const KEY\s*=\s*"([^"]+)"', _core_src)
OLD_KEY = find(r'const OLD_KEY\s*=\s*"([^"]+)"', _core_src)

# ---- テストで使う場所（緯度, 経度） ---------------------------------------------
TW_T1 = (36.20816, 139.03238)   # ツインレイクス 1番ティー
TW_M1 = (36.20680, 139.03180)   # 1番の途中（ティーから約175Y）
TW_L1 = (36.20600, 139.03120)   # 1番のグリーン手前
TA_T1 = (36.01813, 139.29025)   # 玉川 1番ティー
TA_MID1 = (36.0199, 139.2896)   # 玉川 1番の途中
TA_G1 = (36.0217, 139.28869)    # 玉川 1番グリーン
TA_T9 = (36.01848, 139.29295)   # 玉川 9番ティー

DEF_CLUBS = [("1W", 180), ("3W", 150), ("5W", 150), ("4U", 160), ("5U", 140), ("6I", 130),
             ("7I", 130), ("8I", 120), ("9I", 105), ("PW", 100), ("AW", 85), ("SW", 60)]


def phone_state(**over):
    """スマホに残っていそうな記録（ラウンドを1回保存したあと）を作る。打数などの数字は、テスト用に作ったもの。"""
    s = {
        "cv": 2, "cur": 9, "tee": "w", "gps": False,
        "clubs": [{"name": n, "dist": d} for n, d in DEF_CLUBS],
        "holes": {"9": {"shots": [{"c": "1W", "r": "ok", "pen": 0, "before": 381, "lie": "fw"}],
                        "rem": 194, "putts": 1, "green": True}},
        "hist": [{"id": "1", "date": "2026-11-09", "tee": "w", "n": 18, "t": 140, "o": 68, "i": 72, "p": 72,
                  "a": {"bunker": 2, "miss": 1, "ob": 1, "putts": 40}, "holes": [], "shots": []}],
        "rid": "1",
    }
    s.update(over)
    return s


# ---- テスト用のWebサーバー ------------------------------------------------------
SLOW = set()  # ここに入れた道すじ（例 "/js/gps.js"）は、返事を9秒遅らせる（電波が弱い時の再現）
# 公開の直後に、配信の中継（CDN）が前の版の写しを返す状態の再現。道すじ → 古い中身。
# GitHub Pages の中継は、住所の「?」以降を見ずに写しを返す（2026-11-18 に実物で確認）ので、ここでも「?」以降は見ない
STALE = {}


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        # GitHub Pages と同じく「10分は使い回してよい」と答える（更新のテストのため）
        self.send_header("Cache-Control", "max-age=600")
        super().end_headers()

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path in SLOW:
            time.sleep(9)
        if path in STALE:
            body = STALE[path]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return None
        return super().do_GET()


class _Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass  # 画面を閉じたあとに返事を書こうとして失敗するのは、テストでは普通のこと


def serve(folder):
    """folder を配信して (サーバー, 'http://127.0.0.1:ポート/') を返す。"""
    srv = _Server(("127.0.0.1", 0), functools.partial(_Quiet, directory=folder))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, "http://127.0.0.1:%d/" % srv.server_address[1]


# ---- 結果の記録 -----------------------------------------------------------------
class Result:
    def __init__(self):
        self.ok, self.bad, self.skipped, self.retried = [], [], [], []
        self.group = ""

    def mark(self):
        """今までの結果の数（やり直すときに、ここまで巻き戻す）。"""
        return len(self.ok), len(self.bad), len(self.skipped)

    def rollback(self, m):
        del self.ok[m[0]:], self.bad[m[1]:], self.skipped[m[2]:]

    def check(self, name, cond, info=""):
        full = self.group + " / " + name
        (self.ok if cond else self.bad).append(full)
        print(("  PASS  " if cond else "  FAIL  ") + name + ("" if cond else "   <<< " + str(info)[:400]))

    def skip(self, name, why):
        self.skipped.append(self.group + " / " + name)
        print("  SKIP  " + name + "（" + why + "）")


R = Result()
check = R.check
RETRY = 1 if os.environ.get("CI") else 0  # GitHub の中でだけ、失敗した場面を1回やり直す


# ---- 画面を操作する小道具 --------------------------------------------------------
class App:
    """1つのブラウザ画面（スマホ1台ぶん）。"""

    def __init__(self, browser, base, pos=None, width=390, height=760, sw="block", dark=False, swap=0):
        perms = ["clipboard-read", "clipboard-write"]
        kw = dict(viewport={"width": width, "height": height}, service_workers=sw,
                  color_scheme="dark" if dark else "light")
        if pos:
            kw.update(geolocation={"latitude": pos[0], "longitude": pos[1], "accuracy": 8})
            perms.append("geolocation")
        kw["permissions"] = perms
        self.base = base
        self.ctx = browser.new_context(**kw)
        # 番手を続けて押したとき、入れ替えにせず毎回1打として記録する（本番は20秒以内なら入れ替え）
        self.ctx.add_init_script("window.__SWAP_MS = %d" % swap)
        self.g = self.ctx.new_page()
        self.errors = []
        self.g.on("pageerror", lambda e: self.errors.append(str(e)))

    # 開く・読み直す
    def open(self, path="index.html", wait=500, ready=True):
        self.g.goto(self.base + path)
        if ready and path in ("", "index.html"):
            self.ready()
        self.g.wait_for_timeout(wait)
        return self

    def ready(self, timeout=20000):
        """アプリの起動（js フォルダのファイルを全部そろえて動かす）が終わるまで待つ。"""
        self.g.wait_for_function("window.APP_READY === true", timeout=timeout)

    def reload(self, wait=450, ready=True):
        self.g.reload()
        if ready and self.g.url.split("#")[0].split("?")[0].endswith(("/", "/index.html")):
            self.ready()
        self.g.wait_for_timeout(wait)

    def sw_active(self, ver):
        """ver の版の保存係が、もう働いているか（保存係の中の値を直接見る。v28 までの保存係は、版の値を持っていない）。"""
        for w in self.ctx.service_workers:
            try:
                if w.evaluate("v => typeof APP_VER === 'string' && APP_VER === v && !!self.serviceWorker"
                              " && self.serviceWorker.state === 'activated'", ver):
                    return True
            except Exception:
                pass  # 止まった保存係は、値を見られない
        return False

    def switched(self, ver, timeout=45):
        """保存係が ver の版に入れ替わり、画面もその版で起動し終わるまで待つ。
        （入れ替わると、古い版の保存場所が消え、画面は自動で1回読み直される）"""
        end = time.time() + timeout
        while time.time() < end:
            if self.sw_active(ver):
                self.g.wait_for_timeout(1200)  # 自動の読み直しが済むのを待つ
                try:
                    if self.g.evaluate("v => window.APP_READY === true && typeof APP_VER === 'string' && APP_VER === v", ver):
                        self.g.wait_for_timeout(300)
                        return
                except Exception:
                    pass  # 読み直しの最中
            self.g.wait_for_timeout(250)
        raise AssertionError("保存係が %s に入れ替わりませんでした" % ver)

    def tap_reload(self, sel, wait=300):
        """押すと画面が読み直されるボタンを押し、起動が終わるまで待つ。"""
        with self.g.expect_navigation():
            self.g.click(sel)
        self.ready()
        self.g.wait_for_timeout(wait)

    def seed(self, state, key=None):
        """保存場所に記録を入れてから読み直す（スマホに記録が残っている状態を作る）。"""
        self.g.evaluate("([k,v])=>localStorage.setItem(k,v)", [key or KEY, json.dumps(state)])
        self.reload()

    def close(self):
        self.ctx.close()

    # 押す・待つ・読む
    def tap(self, *sels, wait=60):
        for s in sels:
            self.g.click(s)
        self.g.wait_for_timeout(wait)

    def wait(self, ms=150):
        self.g.wait_for_timeout(ms)

    def text(self, sel):
        return self.g.inner_text(sel)

    def js(self, expr, arg=None):
        return self.g.evaluate(expr, arg) if arg is not None else self.g.evaluate(expr)

    def count(self, sel):
        return self.g.locator(sel).count()

    def tab(self, name):
        self.tap('.tabbar [data-view="%s"]' % name, wait=100)

    def hit(self, club, res="ok"):
        """番手を押して1打を記録する。res が ok 以外（ob / pond / lost / miss）なら、その結果も押す。"""
        self.tap('button[data-club="%s"]' % club, wait=120)
        if res == "ok" and self.count('button[data-res="ok"]'):
            self.tap('button[data-res="ok"]', wait=120)  # 前の版（v29 まで）の画面は、番手のあとに結果を押す
        elif res != "ok":
            self.tap('button[data-res="%s"]' % res, wait=120)

    def undo(self):
        """最後の打を消す（打の一覧で最後の打を押す → 「この打を消す」）。"""
        n = self.count(".log [data-ed]")
        self.tap('.log [data-ed="%d"]' % (n - 1), "[data-del]", wait=100)

    def move(self, pos, acc=8, wait=1400):
        """にせものの現在地を動かす。"""
        self.ctx.set_geolocation({"latitude": pos[0], "longitude": pos[1], "accuracy": acc})
        self.g.wait_for_timeout(wait)

    def sug(self):
        return self.text(".sug").replace("\n", " / ")

    def clip(self):
        return self.js("navigator.clipboard.readText()")

    def status(self):
        return self.text("#status")

    def width_ok(self):
        return self.js("document.documentElement.scrollWidth") <= self.g.viewport_size["width"]

    def shot(self, name, full=False):
        if SHOTS:
            os.makedirs(SHOTS, exist_ok=True)
            self.g.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=full)


TESTS = []


def test(fn):
    TESTS.append(fn)
    return fn


# =================================================================================
# ここからテスト本体。1つの関数が1つの場面。
# =================================================================================

@test
def version_single_source(b, base):
    """版番号が1か所（js/version.js）だけにあり、画面に出ていること"""
    check("version.js に版・日付・名前がある", bool(VER and APP_DATE and APP_NAME), (VER, APP_DATE, APP_NAME))
    others = {}
    for f in ["sw.js", "index.html", "manifest.webmanifest", "send.html"] + \
             ["js/" + x for x in sorted(os.listdir(os.path.join(ROOT, "js"))) if x != "version.js"]:
        hits = re.findall(r"""["'`]v\d{2,3}["'`]""", read(f))
        if hits:
            others[f] = hits
    check("ほかのファイルに版番号を直接書いていない", not others, others)
    listed = set(re.findall(r'"((?:js/)?[\w.-]+\.(?:js|html|png|webmanifest))"', read("sw.js")))
    need = {"index.html", "send.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"} | \
           {"js/" + x for x in os.listdir(os.path.join(ROOT, "js"))}
    check("sw.js の保存リストに全ファイルが入っている", need <= listed, sorted(need - listed))
    boot = find(r'<script id="boot">(.*?)</script>', read("index.html").replace("\n", " "), "")
    names = re.findall(r'"([\w-]+)"', find(r"var FILES = \[(.*?)\]", boot, ""))
    check("index.html の起動係が js フォルダの全ファイルを読み込む（send.js を除く）",
          sorted(names) == sorted(x[:-3] for x in os.listdir(os.path.join(ROOT, "js")) if x != "send.js") and len(names) == len(set(names)),
          names)
    check("index.html は、js フォルダのファイルを直接は読み込まない（そろう前に動き出さないように）",
          not re.findall(r'<script[^>]+src="js/', read("index.html")))
    in_boot = {k: find(k + r' = "([^"]+)"', boot) for k in ("OLD_KEY", "NEW_KEY")}
    check("起動係に書いた保存場所の名前が、js/core.js と同じ", in_boot == {"OLD_KEY": OLD_KEY, "NEW_KEY": KEY}, in_boot)
    a = App(b, base).open()
    check("上の帯に版が出る", VER in a.text("#scorebar"), a.text("#scorebar"))
    for v in ["hole", "score", "advice", "clubs", "coach"]:
        a.tab(v)
        line = a.text("#verline")
        if not (VER in line and APP_DATE in line and APP_NAME in line):
            check("画面の下に版と日付が出る（%s）" % v, False, line)
            break
    else:
        check("全画面の下に、名前・版・日付が出る", True)
    check("ページの題名", APP_NAME in a.js("document.title") or "攻略" in a.js("document.title"), a.js("document.title"))
    m = json.loads(read("manifest.webmanifest"))
    check("ホーム画面に出す名前がコース名でない", "ツインレイクス" not in m["name"] + m["short_name"], m["name"])
    check("エラーなし", a.errors == [], a.errors)
    a.close()


# ---- 版の上げ忘れを見つける ------------------------------------------------------
# スマホは「版が変わったとき」だけ新しいファイルを取りに行く。
# 公開するファイルを直したのに版がそのままだと、スマホは古いファイルを使い続ける。
NOT_PUBLISHED = ("tests/", "tools/", "README.md", ".")  # 公開しないもの（これだけ直したときは、版を上げなくてよい）


def _git(root, *args):
    """git の命令を1つ実行して、出力を返す。失敗したら None。"""
    try:
        r = subprocess.run(["git", "-C", root] + list(args), capture_output=True, text=True,
                           encoding="utf8", timeout=30)
    except Exception:
        return None
    return r.stdout if r.returncode == 0 else None


def version_bump_state(root, base_sha=""):
    """公開するファイルの変更と、版の変更をくらべる。

    戻り値: (結果, 説明)。結果は
      "skip"  … 確かめられない（git の管理下にない、くらべる相手がない など）
      "ok"    … 問題なし
      "bad"   … 公開するファイルを直したのに、版が前と同じ
    """
    if _git(root, "rev-parse", "--is-inside-work-tree") is None:
        return "skip", "git の管理下にない"
    dirty = bool((_git(root, "status", "--porcelain", "--", ".") or "").strip())
    base = (base_sha or "").strip()
    if not base or set(base) == {"0"} or _git(root, "cat-file", "-e", base + "^{commit}") is None:
        base = "HEAD" if dirty else "HEAD~1"  # 直している途中なら最後の記録と、そうでなければ1つ前の記録とくらべる
    if _git(root, "cat-file", "-e", base + "^{commit}") is None:
        return "skip", "くらべる相手（前の記録）がない"
    changed = (_git(root, "diff", "--name-only", "--relative", base, "--", ".") or "").split("\n")
    changed += (_git(root, "ls-files", "--others", "--exclude-standard", "--", ".") or "").split("\n")
    changed = sorted({f for f in changed if f and not f.startswith(NOT_PUBLISHED)})
    if not changed:
        return "ok", "公開するファイルは変わっていない"
    prefix = (_git(root, "rev-parse", "--show-prefix") or "").strip()
    old_src = _git(root, "show", base + ":" + prefix + "js/version.js")
    if old_src is None:
        return "ok", "前の記録に js/version.js が無い（分ける前の版からの切り替え）"
    with open(os.path.join(root, "js", "version.js"), encoding="utf8") as f:
        new_ver = find(r'APP_VER\s*=\s*"([^"]+)"', f.read())
    old_ver = find(r'APP_VER\s*=\s*"([^"]+)"', old_src)
    if old_ver == new_ver:
        return "bad", "版が %s のまま。直したファイル: %s" % (new_ver, ", ".join(changed[:8]))
    # ホールの画像（images.js）は大きいので、スマホは「画像の版（IMG_REV）」が変わったときだけ取り直す
    if "images.js" in changed:
        with open(os.path.join(root, "js", "version.js"), encoding="utf8") as f:
            new_img = find(r'IMG_REV\s*=\s*"([^"]+)"', f.read())
        if find(r'IMG_REV\s*=\s*"([^"]+)"', old_src) == new_img:
            return "bad", "images.js を作り直したのに、画像の版（IMG_REV）が %s のまま" % new_img
    return "ok", "版 %s → %s（直したファイル %d 個）" % (old_ver, new_ver, len(changed))


@test
def version_bumped(b, base):
    """公開するファイルを直したら、版（js/version.js の APP_VER）も上げてあること"""
    state, info = version_bump_state(ROOT, os.environ.get("BASE_SHA", ""))
    if state == "skip":
        R.skip("版の上げ忘れ", info)
        return
    check("ファイルを直したら版も上げている（上げ忘れると、スマホが古いファイルを使い続ける）", state == "ok", info)
    print("        " + info)


@test
def version_bump_checker(b, base):
    """版の上げ忘れを見つける仕組みそのものが、正しく働くこと"""
    if shutil.which("git") is None:
        R.skip("上げ忘れの検査の確認", "git が入っていない")
        return
    tmp = tempfile.mkdtemp(prefix="golf-bump-")
    try:
        os.makedirs(os.path.join(tmp, "js"))
        os.makedirs(os.path.join(tmp, "tests"))

        def put(path, text):
            with open(os.path.join(tmp, path), "w", encoding="utf8") as f:
                f.write(text)

        def commit(msg):
            _git(tmp, "add", "-A")
            return _git(tmp, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", msg) is not None

        check("git の管理下にないフォルダでは確かめない", version_bump_state(tmp)[0] == "skip")
        _git(tmp, "init", "-q")
        put("js/version.js", 'const APP_VER = "v40";\n')
        put("js/main.js", "// 1\n")
        put("README.md", "1\n")
        put("tests/t.py", "# 1\n")
        check("最初の記録を作れる", commit("1"))
        first = (_git(tmp, "rev-parse", "HEAD") or "").strip()
        check("記録が1つだけのときは確かめない", version_bump_state(tmp)[0] == "skip", version_bump_state(tmp))
        put("js/main.js", "// 2\n")
        check("直している途中：版を上げていなければ見つける", version_bump_state(tmp)[0] == "bad", version_bump_state(tmp))
        put("js/version.js", 'const APP_VER = "v41";\n')
        check("直している途中：版を上げていれば通す", version_bump_state(tmp)[0] == "ok", version_bump_state(tmp))
        commit("2")
        check("記録したあと：1つ前の記録とくらべて通す", version_bump_state(tmp)[0] == "ok", version_bump_state(tmp))
        put("README.md", "2\n")
        put("tests/t.py", "# 2\n")
        commit("3")
        check("説明書とテストだけを直したときは、版を上げなくてよい", version_bump_state(tmp)[0] == "ok", version_bump_state(tmp))
        put("index.html", "<p>new</p>\n")
        check("新しく足したファイルも見つける", version_bump_state(tmp)[0] == "bad", version_bump_state(tmp))
        commit("4")
        check("記録したあと：版を上げ忘れた記録を見つける", version_bump_state(tmp)[0] == "bad", version_bump_state(tmp))
        check("前に公開した時点（BASE_SHA）とくらべる：その間に版が上がっていれば通す",
              version_bump_state(tmp, first)[0] == "ok", version_bump_state(tmp, first))
        check("BASE_SHA が0だけ・知らない値のときは、1つ前の記録とくらべる",
              version_bump_state(tmp, "0" * 40)[0] == "bad" and version_bump_state(tmp, "f" * 40)[0] == "bad")
        put("js/version.js", 'const APP_VER = "v42";\nconst IMG_REV = "1";\n')
        commit("5")
        check("版を上げれば、また通る", version_bump_state(tmp)[0] == "ok", version_bump_state(tmp))
        five = (_git(tmp, "rev-parse", "HEAD") or "").strip()
        put("images.js", "const IMGX={};\n")
        put("js/version.js", 'const APP_VER = "v43";\nconst IMG_REV = "1";\n')
        commit("6")
        check("画像を作り直したのに、画像の版がそのままなら見つける",
              version_bump_state(tmp)[0] == "bad" and "IMG_REV" in version_bump_state(tmp)[1], version_bump_state(tmp))
        put("js/version.js", 'const APP_VER = "v44";\nconst IMG_REV = "2";\n')
        commit("7")
        check("画像の版も上げれば通る（前に公開した時点＝画像を作り直す前 とくらべて）",
              version_bump_state(tmp, five)[0] == "ok", version_bump_state(tmp, five))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@test
def storage_migration(b, base):
    """前の保存場所（v28まで）の記録が、新しい保存場所へ引き継がれること"""
    a = App(b, base).open()
    a.seed(phone_state(), key=OLD_KEY)
    check("履歴と途中の記録を引き継ぐ", a.js("R.hist.length") == 1 and a.js("R.cur") == 9 and a.js("R.holes[9].putts") == 1)
    check("新しい保存場所にコピーされる", a.js("k=>localStorage.getItem(k)!=null", KEY))
    check("前の保存場所は消さない（戻せるように）", a.js("k=>localStorage.getItem(k)!=null", OLD_KEY))
    # 新しい場所ができたあとは、前の場所を読みも書きもしない
    old_now = json.dumps(phone_state(cur=3))
    a.js("([k,v])=>localStorage.setItem(k,v)", [OLD_KEY, old_now])
    a.tap('[data-go="1"]')
    if unfinished_stop(a):
        a.tap('[data-go="1"]')
    a.hit("7I")                                                # 10番で1打（新しい場所へ書く）
    check("書きこみは新しい場所へ。前の場所は変えない",
          a.js("k=>JSON.parse(localStorage.getItem(k)).holes[10].shots.length", KEY) == 1 and a.js("k=>localStorage.getItem(k)", OLD_KEY) == old_now)
    a.reload()
    check("2回目以降は新しい場所だけを読む（前の場所の中身が変わっていても、引きずられない）",
          a.js("R.cur") == 10 and a.js("R.holes[10].shots.length") == 1 and a.js("k=>localStorage.getItem(k)", OLD_KEY) == old_now, a.js("R.cur"))
    a.tab("score")
    kb = int(find(r"約(\d+)KB", a.text("#usage"), "0"))
    both = a.js("([k1,k2])=>Math.round((localStorage.getItem(k1).length+localStorage.getItem(k2).length)/1024)", [KEY, OLD_KEY])
    check("保存している量は、前の保存場所の分も数える", kb >= max(1, both) and "写しを含む" in a.text("#usage"), (kb, both, a.text("#usage")))
    a.tab("hole")
    # 画像を開いた鍵も引き継ぐ
    a.js("()=>localStorage.clear()")
    a.js("([k,v])=>localStorage.setItem(k,v)", [OLD_KEY + "-img", "abc"])
    a.reload()
    check("画像の鍵も引き継ぐ", a.js("k=>localStorage.getItem(k)", KEY + "-img") == "abc")
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def plan_and_unfinished(b, base):
    """長い残り距離の計画と、記録が途中のホールで1回止める動き"""
    a = App(b, base).open()
    st = phone_state(cur=7, rid=None, holes={"7": {"shots": [{"c": "1W", "r": "ok", "pen": 0, "before": 537, "lie": "fw"}],
                                                   "rem": 302, "putts": 0, "green": False, "arr": 1}})
    a.seed(st)
    check("途中の記録が残る", a.text(".rem") == "302Y")
    check("302Yは3回の計画", "計画：7I → 7I → SW（3回" in a.sug(), a.sug())
    st["holes"]["7"]["rem"] = 214
    a.seed(st)
    check("214Yは2回の計画", "（2回でグリーンへ）" in a.sug(), a.sug())
    st["holes"]["7"]["rem"] = 120
    a.seed(st)
    check("120Yは1本で届く番手", a.text(".sug .c") == "8I", a.sug())
    a.tap('[data-go="1"]', wait=100)
    check("途中のホールは1回止める", "7番 Par5" in a.text("#pick option:checked") and "途中" in a.status(), a.status())
    a.tap('[data-go="1"]', wait=100)
    check("もう一度押すと進む", "8番" in a.text("#pick option:checked"))
    a.tap('[data-go="1"]', wait=100)
    check("記録のないホールはすぐ進む", "9番" in a.text("#pick option:checked"))
    a.hit("1W")
    a.hit("7I")
    a.tap('[data-act="green"]', '[data-putt="1"]', '[data-putt="1"]')
    a.tap('[data-go="1"]', wait=100)
    check("打ち終えたホールは止めない", "10番" in a.text("#pick option:checked"))
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def course_add_and_switch(b, base):
    """コースデータの貼り付け（追加）・切り替え・削除と、安全な取りこみ"""
    a = App(b, base).open()
    a.seed(phone_state())
    a.tab("clubs")
    check("内蔵コースは2つ", a.g.locator("#csel option").all_inner_texts() == ["ツインレイクスCC", "玉川CC"] and a.count("[data-cdel]") == 0)
    check("座標の数を表示", "18/18" in a.text(".card:has(#csel) .note"))
    a.tap("[data-ccopy]", wait=200)
    tw = json.loads(a.clip())
    check("内蔵コースを書き出せる", len(tw["holes"]) == 18 and tw["holes"][0]["y"] == {"b": 385, "w": 347, "g": 330}
          and tw["holes"][16]["tc"] == [36.21311, 139.04174], str(tw["holes"][0])[:120])
    new = {"name": "テスト <b>CC", "base": "r", "tees": [["r", "Regular"], ["l", "Ladies"]],
           "holes": [{"p": [4, 3, 5][i % 3], "y": {"r": 300 + i, "l": 250 + i}} for i in range(18)]}
    new["holes"][0].update(gc=[35.0, 139.0], tc=[35.003, 139.0], aim="<img src=x onerror=alert(1)>広いほう",
                           wp=[[35.002, 139.001]], plus=15)
    new["ponds"] = [[35.001, 139.0005, 20], ["x", 1, 2]]
    new["ch"] = [35.0035, 139.0]
    a.g.fill("#cjson", "{bad")
    a.tap("[data-cadd]", wait=100)
    check("読めない文は断る", "読めません" in a.status())
    short = dict(new)
    short["holes"] = new["holes"][:17]
    a.g.fill("#cjson", json.dumps(short))
    a.tap("[data-cadd]", wait=100)
    check("17ホールは断る", "18ホール" in a.status(), a.status())
    a.g.fill("#cjson", json.dumps(new))
    a.tap("[data-cadd]", wait=150)
    check("追加するとそのコースに切り替わる", a.js("CO.name") == "テストbCC" and a.count("[data-tee]") == 2 and a.js("R.tee") == "r", a.status())
    check("通過点・足すヤード・池・クラブハウスも取りこむ",
          a.js("D[0].wp") == [[35.002, 139.001]] and a.js("D[0].plus") == 15 and a.js("CO.ponds") == [[35.001, 139.0005, 20]]
          and a.js("CO.ch") == [35.0035, 139.0], a.js("JSON.stringify([D[0].wp,D[0].plus,CO.ponds,CO.ch])"))
    a.tab("hole")
    check("新しいコースの1番", a.text(".rem") == "300Y" and "Regular 300Y" in a.text(".lab") and "HDCP" not in a.text(".lab")
          and a.count("#imgpw") == 0, a.text(".lab"))
    check("危ない文字（タグ）は取り除く", a.js("document.querySelectorAll('#app img,#app [onerror],#app script').length") == 0
          and "広いほう" in a.text("#app"))
    a.tap('[data-go="1"]', wait=100)
    check("座標のないホールは図の代わりに説明", a.text(".rem") == "301Y" and "未登録" in a.text(".card:has([data-mapv])"))
    a.tap('[data-mapv="course"]', wait=80)
    check("座標が1ホールだけでも全体図を出す", a.count(".card:has([data-mapv]) svg") == 1)
    a.tab("advice")
    a.tap('[data-adv="chart"]', wait=80)
    check("ほかのコースのメモは出さない", "3番・17番" not in a.text("#app"))
    a.tab("hole")
    a.hit("7I")
    a.tab("score")
    a.tap("[data-rcopy]", wait=200)
    head = a.clip().split("\n")[0]
    check("結果の1行目はコース名・日付・ティー・版", head.startswith("テストbCC ") and (" Regular アプリ" + VER) in head, head)
    a.tap("[data-hsave]", wait=80)
    check("履歴にコース名が出る", "テストbCC"[:6] in a.text(".card:has([data-hsave]) tbody"))
    a.reload()
    check("読み直してもコースを覚えている", a.js("CO.name") == "テストbCC" and a.js("document.title") == "テストbCC 攻略")
    a.tab("score")
    a.tap("[data-hnew]", "[data-hnew]")
    a.tab("clubs")
    a.tap("[data-cdel]", "[data-cdel]", wait=100)
    check("消すと最初のコースへ戻る", a.js("CO.id") == "twinlakes" and a.count("#csel option") == 2 and a.js("R.tee") == "w")
    a.tab("hole")
    check("戻ったコースの途中の記録が残っている", a.js("R.cur") == 9 and a.count("#imgpw") == 1 and a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def course_switch_keeps_rounds(b, base):
    """記録の途中でコースを切り替えても、コースごとに記録が残ること"""
    a = App(b, base).open()
    a.seed(phone_state())
    check("ホール画面の上にコースの選択欄", a.g.locator("#csel2 option").all_inner_texts() == ["ツインレイクスCC", "玉川CC"])
    a.g.select_option("#csel2", "tamagawa")
    a.wait(200)
    check("途中でも切り替えられる", a.js("CO.id") == "tamagawa" and a.js("R.cur") == 1 and "残してあります" in a.status(), a.status())
    check("玉川の1番", a.text(".rem") == "516Y")
    a.hit("1W")
    a.g.select_option("#csel2", "twinlakes")
    a.wait(200)
    check("戻ると続きから", a.js("R.cur") == 9 and a.js("R.holes[9].putts") == 1 and a.js("R.rid") == "1" and "戻しました" in a.status(), a.status())
    a.g.select_option("#csel2", "tamagawa")
    a.wait(200)
    check("玉川の途中の記録も残る", a.js("R.holes[1].shots.length") == 1 and a.js("R.rid") is None)
    a.reload()
    check("読み直しても残る", a.js("CO.id") == "tamagawa" and a.js("R.rounds.twinlakes.cur") == 9)
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def gps_measure_and_late_press(b, base):
    """GPSの残り距離・実測飛距離と、押し遅れのときの守り（ツインレイクス1番）"""
    a = App(b, base, pos=TW_T1).open()
    a.tap('[data-act="gps"]', wait=900)
    check("ティーではティーショットの案内", "ティーショット" in a.text(".card:has(.clubs) .h"), a.text("#gpsline"))
    a.move(TW_M1)
    a.hit("1W")
    s = a.js("R.holes[1]")
    check("ティーから離れて押した1打は実測しない", s["shots"][0]["from"] is None and s["shots"][0]["before"] == 347
          and s["rem"] == 214 and "実測は記録しません" in a.status(), json.dumps(s["shots"][0]) + " rem " + str(s["rem"]))
    a.tap('[data-lie="fw"]', wait=150)
    check("その1打に飛距離を付けない", "dist" not in a.js("R.holes[1].shots[0]"))
    a.move(TW_L1)
    a.hit("7I")
    s2 = a.js("R.holes[1].shots[1]")
    check("2打目は、球に着いた合図の場所から測る", abs(s2["from"][0] - TW_M1[0]) < 1e-6 and s2["before"] == 214
          and a.js("R.holes[1].rem") == a.js("G.y"), json.dumps(s2))
    a.tap('[data-act="green"]', wait=100)
    check("2打目の実測は114Y", a.js("R.holes[1].shots[1].dist") == 114, a.js("R.holes[1].shots[1].dist"))
    check("エラーなし", a.errors == [], a.errors)
    a.close()

    a = App(b, base, pos=TW_T1).open()
    a.tap('[data-act="gps"]', wait=900)
    a.hit("SW")
    a.move(TW_M1)
    a.tap('[data-lie="fw"]', wait=100)
    check("ありえない飛距離（SWで175Y）は捨てる", "dist" not in a.js("R.holes[1].shots[0]"))
    a.undo()
    a.move(TW_T1)
    a.hit("1W")
    a.move(TW_M1)
    a.tap('[data-lie="light"]', wait=100)
    check("ふつうのティーショットは175Yと実測", a.js("R.holes[1].shots[0].dist") == 175, a.js("R.holes[1].shots[0]"))
    a.tab("score")
    t = a.text(".card:has([data-csv])")
    check("スコア画面に実測の表", "番手別の実測飛距離" in t and "175Y" in t, t[:200])
    check("エラーなし（2）", a.errors == [], a.errors)
    a.close()

    # 「番手なしで1打足す」をはさんだとき：間に記録していない1打があるので、その前の1打は測らない
    a = App(b, base, pos=TW_T1).open()
    a.tap('[data-act="gps"]', wait=900)
    a.hit("1W")
    a.tap("[data-add]")
    a.move(TW_M1)
    a.tap('[data-lie="fw"]', wait=150)
    s = a.js("R.holes[1].shots")
    check("番手なしの1打をはさんだら、前の1打（1W）に飛距離を付けない（まちがった距離を残さない）",
          len(s) == 2 and "dist" not in s[0] and "to" not in s[0] and s[1]["r"] == "add", json.dumps(s))
    a.hit("7I")
    a.move(TW_L1)
    a.tap('[data-lie="fw"]', wait=150)
    s = a.js("R.holes[1].shots")
    check("そのあとの1打は、打った場所（今いる場所）から、いつもどおり測る",
          abs(s[2]["from"][0] - TW_M1[0]) < 1e-6 and s[2].get("dist") == 114 and "dist" not in s[0], json.dumps(s[2]))
    check("エラーなし（3）", a.errors == [], a.errors)
    a.close()


@test
def tamagawa_round(b, base):
    """玉川CC：ティーの提案、グリーン登録、池越えのパー3、コース全体図"""
    a = App(b, base, pos=TA_T1).open()
    a.seed(phone_state(holes={}, cur=1, rid=None, course="tamagawa"))
    check("玉川の4つのティー", a.js("CO.id") == "tamagawa" and a.js("CO.tees.map(t=>t[1])") == ["Blue", "White", "Green", "Red"])
    check("履歴は残る", a.js("R.hist.length") == 1)
    check("GPSなし：ティーの番手と狙い", a.text(".sug .c") == "1W" and "3〜4回で運ぶ" in a.text(".sug .n") and a.text(".rem") == "516Y", a.sug())
    a.tap('[data-act="gps"]', wait=900)
    check("GPSあり：ティーにいる間はティーの案内のまま", a.text(".sug .c") == "1W" and "ティーショット" in a.text(".card:has(.clubs) .h"),
          a.text("#gpsline") + " | " + a.sug())
    a.g.locator('[data-mapv="course"]').scroll_into_view_if_needed()
    a.tap('[data-mapv="course"]', wait=200)
    m = a.g.locator(".card:has([data-mapv])")
    check("コース全体図", m.locator("svg circle").count() >= 25 and "クラブハウス" in m.inner_text()
          and m.locator('a[href*="google.com/maps"]').count() == 1, m.locator(".note").inner_text())
    a.shot("tamagawa_course_map")
    a.tap('[data-mapv="hole"]', wait=100)
    a.move(TA_MID1)
    check("歩いて離れると、刻む計画に変わる", "計画：" in a.sug() and "1打目" in a.text(".card:has(.clubs) .h"), a.sug())
    a.hit("1W")
    check("押し遅れの1打は実測しない", a.js("R.holes[1].shots[0].from") is None and a.js("R.holes[1].shots[0].before") == 516, a.status())
    # グリーンの位置を、その場で登録し直す
    a.move((TA_G1[0] + 0.00010, TA_G1[1]), acc=6)
    a.tap('[data-act="green"]', wait=100)
    a.tap("[data-gfix]", wait=150)
    check("グリーンを登録", abs(a.js("D[0].gc[0]") - (TA_G1[0] + 0.0001)) < 2e-5 and a.count("[data-gunfix]") == 1, a.status())
    a.reload(600)
    check("登録は読み直しても残る", abs(a.js("D[0].gc[0]") - (TA_G1[0] + 0.0001)) < 2e-5)
    a.tap("[data-gunfix]", wait=100)
    check("登録を取り消せる", a.js("D[0].gc[0]") == 36.0217)
    a.move(TA_MID1, acc=6)
    a.tap("[data-gfix]", wait=100)
    check("グリーンから遠い場所では登録しない", "離れています" in a.status(), a.status())
    # 9番：池越えのパー3
    a.ctx.set_geolocation({"latitude": TA_T9[0], "longitude": TA_T9[1], "accuracy": 6})
    a.g.select_option("#pick", "9")
    a.wait(1500)
    check("9番は池越え：届く番手が無いときの案内", a.text(".sug .c") == "4U" and "届く番手がありません" in a.text(".sug .n")
          and "池を確実に" in a.text(".sug .n"), a.text(".rem") + " " + a.sug())
    a.tab("coach")
    t = a.text("#app")
    check("コーチの教え（番手別）", "左足かかとの内側" in t and "11/08" in t)
    a.tap('[data-coach="base"]')
    check("コーチの教え（基本）", "前傾を保ったまま" in a.text("#app") and "当日はこの3つだけ" in a.text("#app"))
    a.tab("score")
    a.tap("[data-rcopy]", wait=200)
    check("結果の1行目は玉川CC", a.clip().startswith("玉川CC "), a.clip().split("\n")[0])
    check("横にはみ出さない", a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def demo_mode(b, base):
    """お試しモード：本番の記録を変えずに操作を試せること"""
    a = App(b, base).open()
    a.seed(phone_state(course="tamagawa", holes={"1": {"shots": [{"c": "1W", "r": "ok", "pen": 0, "before": 516, "lie": "fw"}],
                                                       "rem": 336, "putts": 0, "green": False}}, cur=1, rid=None))
    a.tab("clubs")
    a.shot("settings", full=True)
    a.tap_reload('[data-demo="on"]')
    real = a.js("k=>localStorage.getItem(k)", KEY)   # お試しに入った時点の、本番の記録
    check("お試しモードに入る", a.js("DEMO") is True and "お試しモード中" in a.text("#app")
          and a.js("Object.keys(R.holes).filter(k=>R.holes[k].shots.length).length") == 0)
    check("ティーに立った状態で始まる", a.count("[data-sim]") == 4 and "お試しの位置" in a.text("#gpsline") and a.text(".sug .c") == "1W",
          a.text("#gpsline") + " | " + a.sug())
    a.shot("demo")
    y0 = a.js("G.y")
    a.tap('[data-sim="fwd"]', wait=150)
    y1 = a.js("G.y")
    check("「50Y進む」", abs((y0 - y1) - 50) <= 2, (y0, y1))
    a.tap('[data-sim="tee"]', wait=100)
    a.hit("1W")
    for _ in range(4):
        a.tap('[data-sim="fwd"]', wait=80)
    check("残り距離が立つ場所に合わせて変わる", a.text(".rem") == str(a.js("G.y")) + "Y" and "2打目" in a.text(".card:has(.clubs) .h"), a.text(".rem"))
    a.hit("7I")
    check("お試しでも実測飛距離を記録", a.js("R.holes[1].shots[0].dist") in range(190, 211), a.js("JSON.stringify(R.holes[1].shots)"))
    a.tap('[data-sim="near"]', wait=100)
    check("「残り30Y」", a.js("G.y") == 30, a.sug())
    a.tap('[data-sim="green"]', wait=100)
    check("「グリーン上」", a.js("G.y") <= 1)
    a.tap('[data-go="1"]', wait=100)
    if a.js("R.cur") == 1:
        a.tap('[data-go="1"]', wait=100)
    check("次のホールはティーから", a.js("R.cur") == 2 and abs(a.js("G.y") - a.js("yardsTo(D[1].tc,D[1].gc)")) <= 1, a.text("#gpsline"))
    a.g.select_option("#csel2", "twinlakes")
    a.wait(200)
    check("お試し中もコースを切り替えられる", a.js("CO.id") == "twinlakes" and a.js("G.y") is not None, a.text("#gpsline"))
    a.tab("score")
    check("どの画面にも「終わる」ボタン", a.count('[data-demo="off"]') == 1 and a.count("[data-sim]") == 0)
    a.reload()
    check("読み直してもお試しのまま", a.js("DEMO") is True)
    check("お試し中、本番の記録は変わらない", a.js("k=>localStorage.getItem(k)", KEY) == real)
    a.tap_reload('[data-demo="off"]')
    check("終わると本番に戻り、お試しの記録は消える", a.js("DEMO") is False and a.js("k=>localStorage.getItem(k)", KEY) == real
          and a.js("k=>localStorage.getItem(k)", KEY + "-demo") is None and a.js("CO.id") == "tamagawa"
          and a.js("R.holes[1].shots.length") == 1 and a.count('[data-demo="off"]') == 0)
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def lie_and_clubs(b, base):
    """球の場所（ラフ・バンカー）で番手の提案と距離が変わること"""
    a = App(b, base).open()

    def at(rem_y, lie=None):
        a.seed(phone_state(cur=1, rid=None, holes={"1": {"shots": [{"c": "1W", "r": "ok", "pen": 0, "before": 347}],
                                                         "rem": rem_y, "putts": 0, "green": False}}))
        if lie:
            a.tap('[data-lie="%s"]' % lie, wait=60)

    at(120)
    check("FW 120Y は 8I", a.text(".sug .c") == "8I", a.sug())
    at(120, "light")
    check("浅いラフ 120Y は 5U（1割引で届く番手）", a.text(".sug .c") == "5U" and "ラフのため" in a.text(".sug .n"), a.sug())
    at(100, "light")
    check("浅いラフ 100Y は 8I", a.text(".sug .c") == "8I", a.sug())
    at(120, "deep")
    check("深いラフは出すだけ", a.text(".sug .c") == "SWかAWで出す", a.sug())
    c = a.text(".clubs").replace("\n", " ")
    check("深いラフではウェッジ以外「使わない」", "7I 使わない" in c and "SW 30Y" in c and "AW 45Y" in c, c)
    at(200, "light")
    c = a.text(".clubs").replace("\n", " ")
    check("浅いラフではウッドと6Iを使わない", "1W 使わない" in c and "6I 使わない" in c and "7I 115Y" in c and "4U 145Y" in c, c)
    check("届かないラフは花道へ", "花道" in a.text(".sug .c"), a.sug())
    a.hit("7I")
    check("ラフから7I：残り85Y、球の場所はFWに戻る", a.text(".rem") == "85Y" and a.g.locator("[data-lie].act").inner_text() == "FW", a.text(".rem"))
    a.undo()
    check("1打戻すと残りと球の場所も戻る", a.text(".rem") == "200Y" and a.g.locator("[data-lie].act").inner_text() == "浅いラフ")
    at(150, "bunker")
    check("バンカーはSW", a.text(".sug .c") == "SWで出す" and "SW 30Y" in a.text(".clubs").replace("\n", " "), a.sug())
    at(25)
    check("30Y以内は寄せ", a.text(".sug .c") == "SWかAWで寄せる")
    check("横にはみ出さない", a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def stroke_input_v30(b, base):
    """v30 の入れ方：打つ前に番手 → 到着、結果は OB・池・ロスト・空振りだけ、打の一覧から直す、グリーンで打数を合わせる"""
    a = App(b, base, width=360, height=780, swap=20000).open()   # 本番と同じく、20秒以内の押し直しは入れ替え
    st = lambda: a.js("strokes(H(1))")
    check("打つ前は結果のボタンなし", a.count("[data-res]") == 0 and a.count("[data-arrive]") == 0)
    a.tap('button[data-club="1W"]', wait=120)
    check("番手を押すと1打目を記録", st() == 1 and a.js("H(1).shots[0].c") == "1W" and "2打目" in a.text(".card:has(.clubs) .h"))
    check("「到着」ボタンが出る", a.count("[data-arrive]") == 1 and a.text("[data-res]").strip() != "")
    check("結果は OB・池・ロスト・空振りの4つ（普通・短いは無い）",
          [a.g.locator("[data-res]").nth(i).inner_text() for i in range(a.count("[data-res]"))] == ["OB", "池", "ロスト", "空振り"])
    a.tap('button[data-club="3W"]', wait=120)
    check("すぐ押し直すと入れ替わる（打数は増えない）", st() == 1 and a.js("H(1).shots[0].c") == "3W" and "3Wに変えました" in a.status(), a.status())
    a.tap("[data-arrive]", wait=120)
    check("到着を押すと、到着ボタンが消える", a.count("[data-arrive]") == 0 and a.js("H(1).arr") == 1 and "到着" in a.status(), a.status())
    a.tap('button[data-club="7I"]', wait=120)
    check("到着のあとの番手は、次の1打", st() == 2 and a.js("H(1).shots[1].c") == "7I")
    rem_before = a.js("H(1).shots[1].before")
    a.tap('[data-res="pond"]', wait=120)
    check("池：1打罰、次は同じ場所から", st() == 3 and a.js("H(1).rem") == rem_before and "OB池1" in a.text("#scorebar")
          and "池" in a.text(".log"), a.text(".log"))
    a.tap('button[data-club="7I"]', wait=120)
    check("池のあとの番手は、次の1打（入れ替えにしない）", st() == 4)
    a.tap('[data-res="miss"]', wait=120)
    check("空振り：打数はそのまま、距離0", st() == 4 and a.js("H(1).shots[2].r") == "miss" and "空振り1" in a.text("#scorebar"))
    a.tap('button[data-club="SW"]', wait=120)
    check("空振りのあとの番手は、次の1打", st() == 5)
    # 打の一覧から2打目を直す
    a.tap('.log [data-ed="1"]', wait=120)
    check("2打目を押すと、2打目を直す画面", "2打目を直す" in a.text(".card:has(.clubs) .h") and a.count("[data-del]") == 1)
    a.tap('button[data-club="8I"]', wait=120)
    check("番手を直せる（打数は変わらない）", a.js("H(1).shots[1].c") == "8I" and st() == 5)
    a.tap('[data-res="pond"]', wait=120)
    check("池を取り消せる", a.js("H(1).shots[1].r") == "ok" and st() == 4)
    a.tap('[data-res="lost"]', wait=120)
    check("ロストにできる", a.js("H(1).shots[1].k") == "lost" and st() == 5 and "ロスト" in a.text(".log"))
    a.tap("[data-edend]", wait=120)
    check("直し終わると、次の打の画面に戻る", "6打目" in a.text(".card:has(.clubs) .h") and a.count("[data-del]") == 0,
          a.text(".card:has(.clubs) .h"))
    a.tap('.log [data-ed="2"]', "[data-del]", wait=120)
    check("3打目（空振り）を消せる", a.js("H(1).shots.length") == 3 and st() == 4 and "空振り0" in a.text("#scorebar"))
    # グリーン上で、ティーからグリーンまでの打数を合わせる
    a.tap('[data-act="green"]', wait=120)
    check("グリーン上に「ティーからグリーンに乗るまで」", "ティーからグリーンに乗るまで" in a.text("#app") and a.count('[data-gs="1"]') == 1)
    a.tap('[data-gs="1"]', '[data-gs="1"]', wait=100)
    check("＋で打数を足せる", st() == 6 and "ショット 6打" in a.text("#breakdown"), a.text("#breakdown"))
    a.tap('[data-gs="-1"]', wait=100)
    check("−で減らせる", st() == 5)
    a.tap('[data-putt="1"]', '[data-putt="1"]', wait=80)
    check("パットはこれまでどおり", st() == 7 and "パット 2打" in a.text("#breakdown"))
    a.tap('.log [data-ed="0"]', wait=120)
    check("グリーン上でも、前の打を直せる", "1打目を直す" in a.text(".card:has(.clubs) .h"))
    a.tap("[data-edend]", wait=120)
    check("直し終わるとパットの画面に戻る", a.count("#breakdown") == 1)
    check("横にはみ出さない（幅360）", a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def whiff_bunker_scorebar(b, base):
    """空振り・バンカー・OBの数え方と、上の帯（合計）の表示"""
    a = App(b, base, width=360, height=780).open()
    bar = lambda: a.text("#scorebar").replace("\n", " / ")
    a.hit("1W", "miss")
    check("ティーで空振り：1打、残りはそのまま", a.text(".rem") == "347Y" and "合計 1打" in bar() and "空振り1" in bar(), bar())
    a.hit("1W")
    a.tap('[data-lie="bunker"]')
    a.hit("SW", "miss")
    check("バンカーで空振り：球の場所はバンカーのまま", a.g.locator("[data-lie].act").inner_text() == "バンカー" and "空振り2" in bar(), bar())
    a.hit("SW")
    check("バンカーからの1打を数える", "バンカー2" in bar() and "（バンカー）" in a.text(".log"), bar() + " " + a.text(".log"))
    a.undo()
    check("最後の打を消す：球の場所もバンカーへ戻る", a.g.locator("[data-lie].act").inner_text() == "バンカー" and "バンカー1" in bar(), bar())
    a.hit("SW")
    a.hit("AW", "ob")
    check("OBは1打罰", a.js("strokes(H(1))") == 6 and "OB池1" in bar(), bar())
    a.tap('[data-act="green"]', '[data-putt="1"]')
    check("パットを数える", "パット1" in bar() and "1番 7打" in bar(), bar())
    a.tab("advice")
    a.js("window.scrollTo(0,500)")
    a.wait(100)
    check("帯は画面の上に付いたまま", a.js("document.getElementById('scorebar').getBoundingClientRect().top") == 0)
    a.tap("#scorebar", wait=100)
    row = a.text("#app table tbody tr:first-child").replace("\t", " ")
    check("帯を押すとスコア表", row.split() == ["1", "4", "7", "1", "2", "2", "1"], row)
    check("横にはみ出さない（幅360）", a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def forward_tee(b, base):
    """前進ティー（前進4打・パー3は前進3打）"""
    a = App(b, base, width=360, height=780).open()
    a.tap('button[data-club="1W"]')
    check("1打目だけ「前進4打」が出る", a.text("[data-f4]") == "前進4打（特設ティーへ）")
    a.tap("[data-f4]")
    check("残りの初期値は150Y", a.g.input_value("#f4y") == "150")
    a.g.fill("#f4y", "")
    a.tap("[data-f4go]")
    check("空欄は断る", "0から700" in a.status())
    a.g.fill("#f4y", "140")
    a.tap("[data-f4go]", wait=80)
    check("前進4打：次が4打目、残り140Y", a.text(".rem") == "140Y" and a.js("strokes(H(1))") == 3 and "前進4打" in a.text(".log")
          and "OB池1" in a.text("#scorebar"), a.text("#scorebar"))
    a.undo()
    check("1打戻すと元どおり", a.text(".rem") == "347Y" and a.js("strokes(H(1))") == 0)
    a.tap('[data-go="1"]')
    a.tap('button[data-club="5W"]')
    check("パー3は「前進3打」", a.text("[data-f4]") == "前進3打（特設ティーへ）")
    a.tap("[data-f4]", "[data-f4go]", wait=80)
    check("前進3打：次が3打目", a.js("strokes(H(2))") == 2)
    a.tap('[data-go="-1"]')
    a.hit("1W")
    a.tap('button[data-club="7I"]')
    check("2打目からは出ない", a.count("[data-f4]") == 0)
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def feel_and_csv(b, base):
    """1打の感触（方向・当たり）と、番手別の傾向・研究用コピー"""
    a = App(b, base, width=360, height=780).open()
    check("打つ前は感触の欄なし", a.count("[data-fd]") == 0)
    a.hit("1W")
    check("打つと感触の欄", a.count("[data-fd]") == 3 and a.count("[data-fh]") == 4)
    a.tap('[data-fd="right"]', '[data-fh="fat"]', '[data-fh="top"]')
    check("当たりは押し直せる", a.g.locator("[data-fh].act").inner_text() == "トップ")
    a.tap('[data-fd="right"]')
    check("もう一度押すと取り消し", a.count("[data-fd].act") == 0)
    a.tap('[data-fd="left"]')
    a.hit("7I")
    a.tap('[data-fd="straight"]', '[data-fh="good"]')
    a.tap('[data-go="1"]', '[data-go="1"]')
    a.hit("1W")
    a.tap('[data-fd="right"]')
    a.tab("score")
    rows = a.text(".card:has([data-csv]) tbody").replace("\t", " ").split("\n")
    check("番手別の傾向", rows[0].split() == ["1W", "2", "1", "-", "1", "-", "-", "1", "-"] and rows[1].split() == ["7I", "1", "-", "1", "-", "1", "-", "-", "-"], rows)
    a.tap("[data-csv]", wait=120)
    csv = a.g.input_value("#csvbox").split("\n")
    check("研究用コピー", csv[0] == "日付,ホール,番手,結果,残り,球の場所,方向,当たり,実測Y" and len(csv) == 4
          and csv[1] == '"今回","1","1W","普通","347","FW","左","トップ",""', csv[:2])
    a.tap("[data-hsave]", wait=80)
    a.tap("[data-hnew]", "[data-hnew]", wait=80)
    a.tab("score")
    rows = a.text(".card:has([data-csv]) tbody").replace("\t", " ").split("\n")
    check("新しいラウンドを始めても、履歴ぶんの傾向は残る", rows[0].split()[:2] == ["1W", "2"], rows)
    check("横にはみ出さない", a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def history_basic(b, base):
    """履歴に保存・更新・削除、新しいラウンド"""
    a = App(b, base, width=360, height=780).open()
    a.hit("1W")
    a.tab("score")
    a.tap("[data-hsave]", wait=80)
    check("保存すると1行", a.count("[data-hdel]") == 1 and "履歴に保存しました" in a.status())
    check("ボタンが「更新」に変わる", "更新" in a.text("[data-hsave]"))
    a.tap("[data-hnew]")
    check("新しいラウンドは2回押し", "もう一度押すと" in a.text("[data-hnew]"))
    a.tap("[data-hnew]", wait=80)
    check("新しいラウンド：記録は空、ホール画面へ", a.js("roundSummary().n") == 0 and a.count(".clubs") == 1)
    a.hit("7I")
    a.tab("score")
    a.tap("[data-hsave]", wait=80)
    check("2件目", a.count("[data-hdel]") == 2)
    a.g.locator("[data-hdel]").first.click()
    a.wait(40)
    a.g.locator("[data-hdel]").first.click()
    a.wait(60)
    check("履歴の削除は2回押し", a.count("[data-hdel]") == 1)
    a.reload()
    a.tab("score")
    check("読み直しても履歴が残る", a.count("[data-hdel]") == 1)
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def images_unlock(b, base):
    """ツインレイクスの画像：合言葉で開く（IMG_PASS があるときだけ）"""
    a = App(b, base, width=360, height=780).open(wait=900)
    check("最初は合言葉の欄", a.count("#imgpw") == 1 and a.count(".pic img") == 0)
    a.g.fill("#imgpw", "wrong")
    a.tap("[data-unlock]", wait=1300)
    check("まちがった合言葉は断る", "合言葉が違います" in a.text(".card:has(#imgpw) .note"))
    pw = os.environ.get("IMG_PASS")
    if not pw:
        R.skip("正しい合言葉で開く", "環境変数 IMG_PASS が無い")
        a.close()
        return
    a.g.fill("#imgpw", pw)
    a.tap("[data-unlock]", wait=1600)
    check("正しい合言葉で画像が出る", (a.js("document.querySelector('.pic img')&&document.querySelector('.pic img').naturalWidth") or 0) > 100)
    a.reload(900)
    check("次からは入力なしで開く", a.count(".pic img") == 1)
    a.tap('[data-pic="green"]')
    check("グリーンの画像に切り替え", a.count(".pic .tag") == 2)
    a.g.select_option("#csel2", "tamagawa")
    a.wait(150)
    check("画像のないコースでは欄を出さない", a.count(".pic img") == 0 and a.count("#imgpw") == 0)
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def waypoint_distance(b, base):
    """曲がったホールの通過点：コースに沿った残り距離になること（玉川1番）"""
    a = App(b, base, pos=TA_T1).open()
    a.seed(phone_state(holes={}, cur=1, rid=None, course="tamagawa"))
    check("玉川1番と18番に通過点がある", a.js("D[0].wp.length") == 1 and a.js("D[17].wp.length") == 1 and a.js("D.filter(d=>d.wp).length") == 2)
    a.tap('[data-act="gps"]', wait=900)
    path = a.js("Math.round(pathMeters(holePath(D[0]))/YARD)")
    check("ティーでは道のり（直線より長い）を出す", a.js("G.y") == path and a.js("G.direct") == 460 and 465 <= path <= 475, (a.js("G.y"), a.js("G.direct"), path))
    check("直線の距離も添える", "直線460Y" in a.text("#gpsline"), a.text("#gpsline"))
    a.move(TA_MID1)
    check("通過点を過ぎたら直線の距離", a.js("G.y") == a.js("G.direct") and "直線" not in a.text("#gpsline"), a.text("#gpsline"))
    # 道すじを1ヤードずつ進んで、数字が飛ばないこと・だんだん減ることを確かめる
    jump = a.js("""(()=>{const d=D[0],P=holePath(d),L=pathMeters(P);let prev=null,worst=0,up=0;
      for(let m=0;m<=L;m+=YARD){const y=playYards(pathPoint(P,m),d);if(prev!=null){worst=Math.max(worst,Math.abs(prev-y));if(y>prev)up++}prev=y}
      return [worst,up,prev]})()""")
    check("通過点の前後で距離が飛ばない", jump[0] <= 2 and jump[1] == 0 and jump[2] <= 1, jump)
    side = a.js("""(()=>{const d=D[0],W=d.wp[0];const p=[W[0],W[1]+0.0004];return [playYards(p,d),yardsTo(p,d.gc)]})()""")
    check("通過点の真横にいるときは、ほぼ直線の距離", abs(side[0] - side[1]) <= 12, side)
    # 直角に曲がるホールを作って、道のりの計算そのものを確かめる
    dog = a.js("""(()=>{const d={tc:[36,139],wp:[[36.002,139]],gc:[36.002,139.002]};
      return [playYards(d.tc,d),Math.round((metersTo(d.tc,d.wp[0])+metersTo(d.wp[0],d.gc))/YARD),yardsTo(d.tc,d.gc),playYards([36.002,139.001],d),yardsTo([36.002,139.001],d.gc)]})()""")
    check("直角のホール：ティーでは道のり、角を過ぎたら直線", dog[0] == dog[1] and dog[0] > dog[2] + 100 and dog[3] == dog[4], dog)
    # 道すじから外れた球（角の内側・外側）。場所は、ティーを原点にした「東へ◯Y・北へ◯Y」で指定する
    off = a.js("""(()=>{const o=[36,139],at=(e,n)=>[o[0]+n*YARD/110540,o[1]+e*YARD/(Math.cos(o[0]*Math.PI/180)*111320)];
      const d={tc:o,wp:[at(0,200)],gc:at(200,200)};   // 北へ200Y進み、右（東）へ直角に曲がって200Y
      const v=(e,n)=>{const p=at(e,n);return [playYards(p,d),yardsTo(p,d.gc),Math.round((metersTo(p,d.wp[0])+metersTo(d.wp[0],d.gc))/YARD)]};
      // 細かく総なめして、直線より短くならない・「通過点まで歩く道のり」より長くならない・1Y動いて6Yを超えて変わらない、を確かめる
      let below=0,above=0,jump=0;
      for(let e=-80;e<=280;e+=7)for(let n=-80;n<=280;n+=1){const x=v(e,n),y=v(e,n+1);if(x[0]<x[1]-1)below++;if(x[0]>x[2]+1)above++;jump=Math.max(jump,Math.abs(x[0]-y[0]))}
      for(let n=-80;n<=280;n+=7)for(let e=-80;e<=280;e+=1)jump=Math.max(jump,Math.abs(v(e,n)[0]-v(e+1,n)[0]));
      return {on:v(0,150),in10:v(10,150),in60:v(60,150),cut:v(150,150),out:v(-40,150),corner:v(0,200),behind:v(0,-30),over:v(230,200),below,above,jump}})()""")
    check("道すじの上：通過点を通る道のり", off["on"][0] == off["on"][2] == 250, off["on"])
    check("少し外れただけ（内側へ10Y）なら、道すじの上の球と同じだけの回り道を足す",
          abs((off["in10"][0] - off["in10"][1]) - (off["on"][0] - off["on"][1])) <= 1, (off["on"], off["in10"]))
    check("角の内側へ大きく入った球は、直線の距離（長く出しすぎない）",
          off["in60"][0] == off["in60"][1] and off["cut"][0] == off["cut"][1], (off["in60"], off["cut"]))
    check("角の外側の球は、通過点まで歩く道のり", off["out"][0] == off["out"][2], off["out"])
    check("通過点の上・ティーの後ろ・グリーンの先でも、おかしな値にならない",
          off["corner"][0] == 200 and off["behind"][0] >= off["behind"][1] and off["over"][0] == off["over"][1], (off["corner"], off["behind"], off["over"]))
    check("どこにいても、直線以上・通過点まで歩く道のり以下で、急に飛ばない",
          off["below"] == 0 and off["above"] == 0 and off["jump"] <= 6, (off["below"], off["above"], off["jump"]))
    tama = a.js("""(()=>{const d=D[0],o=d.tc,w=xy(d.wp[0],o),L=Math.hypot(w[0],w[1]),u=[w[0]/L,w[1]/L],g=xy(d.gc,d.wp[0]),
      side=Math.sign(u[0]*g[1]-u[1]*g[0]),nm=[-u[1]*side,u[0]*side],q=[w[0]-u[0]*25+nm[0]*35,w[1]-u[1]*25+nm[1]*35],
      p=[o[0]+q[1]/110540,o[1]+q[0]/(Math.cos(o[0]*Math.PI/180)*111320)];return [playYards(p,d),yardsTo(p,d.gc)]})()""")
    check("玉川1番：角の手前で内側へ約38Y外れた球は、直線とほぼ同じ（前は26Y長く出ていた）", 0 <= tama[0] - tama[1] <= 5, tama)
    two = a.js("""(()=>{const o=[36,139],at=(e,n)=>[o[0]+n*YARD/110540,o[1]+e*YARD/(Math.cos(o[0]*Math.PI/180)*111320)];
      const d={tc:o,wp:[at(0,200),at(-30,220)],gc:at(-30,400)},P=[d.tc].concat(d.wp,[d.gc]);
      let jump=0;for(let e=-90;e<=60;e+=5)for(let n=-60;n<=460;n+=1)jump=Math.max(jump,Math.abs(playYards(at(e,n),d)-playYards(at(e,n+1),d)));
      return [playYards(d.tc,d),Math.round(pathMeters(P)/YARD),jump,playYards(at(0,100),{wp:d.wp,gc:d.gc}),yardsTo(at(0,100),d.gc)]})()""")
    check("通過点が2つのホール：ティーでは道のり。通過点を過ぎる時も数字が飛ばない", two[0] == two[1] and two[2] <= 6, two)
    check("ティーの座標が無いホールは、通過点を使わず直線", two[3] == two[4], two)
    a.g.select_option("#pick", "2")
    a.ctx.set_geolocation({"latitude": 36.02331, "longitude": 139.28805, "accuracy": 6})
    a.wait(1500)
    check("通過点のないホールは今までどおり直線", a.js("G.y") == a.js("G.direct") and "直線" not in a.text("#gpsline"), a.text("#gpsline"))
    a.tab("clubs")
    check("設定に通過点のあるホール数を出す", "通過点（曲がり角）のあるホール 2" in a.text(".card:has(#csel) .note"))
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def demo_tap_on_map(b, base):
    """お試しモード：ホール図をタップした場所に立てること"""
    a = App(b, base).open()
    a.seed(phone_state(course="tamagawa", holes={}, cur=1, rid=None))
    a.tap('[data-mapv="hole"]') if a.count('[data-mapv="hole"]') else None
    box = a.g.locator("svg[data-hm]").bounding_box()
    a.g.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    a.wait(150)
    check("本番では、図をタップしても何も起きない", a.js("G.pos") is None and a.js("R.gps") is False)
    a.tab("clubs")
    a.tap_reload('[data-demo="on"]')
    check("お試し中は図にタップの案内", "図をタップ" in a.text(".card:has([data-mapv]) .note"))

    def tap_at(sel):
        """図の中の部品（グリーンの丸など）の真ん中をタップする"""
        a.g.locator("svg[data-hm]").scroll_into_view_if_needed()
        bb = a.g.locator(sel).first.bounding_box()
        a.g.mouse.click(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
        a.wait(200)

    tap_at("svg[data-hm] circle")            # グリーンの丸
    check("グリーンをタップ → グリーン上に立つ", a.js("G.y") <= 4 and "立つ場所" in a.status(), (a.js("G.y"), a.status()))
    tap_at("svg[data-hm] rect")              # ティーの四角
    check("ティーをタップ → ティーに立つ", abs(a.js("yardsTo(G.pos,D[0].tc)")) <= 4 and a.text(".sug .c") == "1W", a.js("yardsTo(G.pos,D[0].tc)"))
    # 図の左端（コースの外側）にも立てる
    a.g.locator("svg[data-hm]").scroll_into_view_if_needed()
    box = a.g.locator("svg[data-hm]").bounding_box()
    a.g.mouse.click(box["x"] + box["width"] * 0.2, box["y"] + box["height"] * 0.5)
    a.wait(200)
    off = a.js("(()=>{const d=D[0],P=holePath(d);let best=1e9;for(let m=0;m<=pathMeters(P);m+=5)best=Math.min(best,metersTo(G.pos,pathPoint(P,m)));return Math.round(best)})()")
    check("道すじから外れた場所（ラフ側）にも立てる", 15 <= off <= 250, off)
    y = a.js("G.y")
    a.tap('[data-sim="fwd"]', wait=150)
    check("そのあとの「50Y進む」は、タップした場所の残りから50Y", abs((y - a.js("G.y")) - 50) <= 3, (y, a.js("G.y")))
    check("エラーなし", a.errors == [], a.errors)
    a.close()


def unfinished_stop(a):
    """次のホールへ進もうとして、「記録が途中のようです」で1回止められたか。"""
    return "途中のようです" in a.status()


@test
def add_stroke_and_putts(b, base):
    """ショットとパットを分けて数える（番手なしの1打、内訳、かんたん入力のパット）"""
    a = App(b, base).open()
    a.tap("[data-add]")
    check("番手なしで1打足す：1打になり、次は2打目", a.js("strokes(H(1))") == 1 and "2打目" in a.text(".card:has(.clubs) .h")
          and "1打（番手なし）" in a.text(".log") and "番手なしで1打足しました" in a.status(), a.text(".log"))
    check("番手別の集計には入れない", a.js("curShots().length") == 0 and a.count("[data-fd]") == 0)
    a.undo()
    check("1打戻せる", a.js("strokes(H(1))") == 0)
    a.hit("1W")
    a.tap("[data-add]")
    a.tap('[data-act="green"]', '[data-putt="1"]', '[data-putt="1"]')
    check("グリーン上に内訳を出す", a.text("#breakdown") == "内訳：ショット 2打 ＋ パット 2打 ＝ 4打", a.text("#breakdown"))
    a.tap('[data-gs="1"]')
    check("グリーン上からショットを1打足せる", a.text("#breakdown") == "内訳：ショット 3打 ＋ パット 2打 ＝ 5打" and a.js("H(1).green") is True, a.text("#breakdown"))
    a.tab("score")
    a.tap("[data-rcopy]", wait=200)
    rows = a.clip().split("\n")
    check("結果の文：ショットとパットが分かれる", rows[4] == "1,4,5,3,2,0,0,0" and sum(1 for r in rows if r.startswith("1,1W,")) == 1, rows[3:6])
    # かんたん入力
    a.tab("hole")
    a.tap('[data-go="1"]')
    a.tap('[data-simple="1"]')
    a.tap('[data-qp="1"]')
    check("かんたん入力：合計より先にパットは入れられない", "先に合計打数" in a.status() and a.js("H(2).putts") == 0)
    a.tap('[data-q="1"]', '[data-q="1"]', '[data-q="1"]')      # パー3 → 3, 4, 5
    a.tap('[data-qp="1"]', '[data-qp="1"]')
    check("かんたん入力：合計5打・うちパット2", a.js("H(2).quick") == 5 and a.js("H(2).putts") == 2 and "パット4" in a.text("#scorebar"), a.text("#scorebar"))
    a.tap('[data-q="-1"]', '[data-q="-1"]', '[data-q="-1"]')   # 合計を2まで下げる
    check("合計を下げると、パットは合計より少なくなる", a.js("H(2).quick") == 2 and a.js("H(2).putts") == 1)
    a.tab("score")
    a.tap("[data-rcopy]", wait=200)
    check("結果の文：かんたん入力でもパットが入る", a.clip().split("\n")[5] == "2,3,2,1,1,0,0,0", a.clip().split("\n")[5])
    a.tab("hole")
    a.tap("[data-qclear]")
    check("入力を消すと、かんたん入力のパットも消える", a.js("H(2).quick") is None and a.js("H(2).putts") == 0)
    a.tap('[data-q="1"]')
    a.tab("score")
    a.tap("[data-rcopy]", wait=200)
    check("パットを入れていないホールは空欄のまま", a.clip().split("\n")[5] == "2,3,3,,,0,0,0", a.clip().split("\n")[5])
    # 1打ごとに記録したホールで、かんたん入力を試してから「入力を消す」：パット数が元に戻ること
    a.tab("hole")
    a.tap('[data-go="1"]')
    if unfinished_stop(a):
        a.tap('[data-go="1"]')
    a.tap('[data-simple="0"]')
    a.hit("7I")
    a.tap('[data-act="green"]', '[data-putt="1"]', '[data-putt="1"]')
    check("3番：1打ごとの記録で3打（ショット1・パット2）", a.js("R.cur") == 3 and a.js("strokes(H(3))") == 3 and a.js("H(3).putts") == 2)
    a.tap('[data-go="1"]')        # かんたん入力への切り替えは、グリーンに乗る前の画面にある → 4番で切り替えて、3番へ戻る
    a.tap('[data-simple="1"]')
    a.tap('[data-go="-1"]')
    check("3番に戻ると、かんたん入力の欄に今の3打が出ている", a.js("R.cur") == 3 and a.count("[data-qclear]") == 1 and a.js("H(3).quick") is None)
    a.tap('[data-q="-1"]')
    check("かんたん入力で合計を2に下げると、パットは1に減る", a.js("H(3).quick") == 2 and a.js("H(3).putts") == 1)
    a.tap('[data-qp="-1"]')
    check("かんたん入力でパットを0にした", a.js("H(3).putts") == 0)
    a.tap("[data-qclear]")
    check("「入力を消す」で、1打ごとの記録（3打・パット2）に戻る",
          a.js("H(3).quick") is None and a.js("H(3).putts") == 2 and a.js("strokes(H(3))") == 3 and a.js("H(3).qWas") is None, a.js("JSON.stringify(H(3))"))
    # 2回押しの確認は、画面を移ると解ける
    a.tab("score")
    a.tap("[data-hnew]")
    check("「新しいラウンドを始める」：1回目は確かめるだけ", "もう一度押すと" in a.text("[data-hnew]"), a.text("[data-hnew]"))
    a.tab("hole")
    a.tab("score")
    check("画面を移ると、確認の状態は解ける", a.text("[data-hnew]") == "新しいラウンドを始める", a.text("[data-hnew]"))
    a.tap("[data-hnew]")
    check("戻ってきて1回押しただけでは、記録は消えない", a.js("roundSummary().n") == 3 and "もう一度押すと" in a.text("[data-hnew]"), a.js("roundSummary().n"))
    a.tap('tr[data-hole="1"]')
    a.tab("score")
    check("スコア表の行から移ったときも、確認の状態は解ける", a.text("[data-hnew]") == "新しいラウンドを始める")
    check("横にはみ出さない", a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()


def _hist(id_, date, course, t, shots=(), n=18, putts=36):
    return {"id": id_, "date": date, "tee": "w", "course": course, "n": n, "t": t, "o": t // 2, "i": t - t // 2, "p": 72,
            "a": {"bunker": 1, "miss": 0, "ob": 1, "putts": putts}, "holes": [5] * n + [None] * (18 - n), "shots": list(shots)}


def _shot(h, c, dist=None, r="ok", lie="fw"):
    s = {"h": h, "c": c, "r": r, "pen": 0, "before": 300, "lie": lie}
    if dist:
        s["dist"] = dist
    return s


@test
def distance_proposals(b, base):
    """実測から番手の距離の見直し案を出し、押した番手だけ変えること"""
    shots = [_shot(i + 1, "7I", d) for i, d in enumerate([118, 131, 105, 120, 119])]          # 中央値119 → 120Y
    shots += [_shot(1, "8I", 100), _shot(2, "8I", 101)]                                        # 2回だけ → 出さない
    shots += [_shot(i + 1, "9I", d) for i, d in enumerate([104, 106, 105])]                    # 設定と同じ → 出さない
    shots += [_shot(i + 1, "SW", 30, lie="bunker") for i in range(4)]                          # バンカーから → 数えない
    shots += [_shot(i + 1, "PW", 60, r="short") for i in range(4)]                             # 結果が「短い」→ 数えない
    shots += [_shot(i + 1, "1W", d) for i, d in enumerate([150, 160, 155, 300])]               # 中央値157.5→158→160Y
    a = App(b, base).open()
    a.seed(phone_state(holes={}, cur=1, rid=None, hist=[_hist("10", "2026-11-07", "ツインレイクスCC", 140, shots)]))
    check("見直し案の中身", a.js("distProposals().map(p=>[p.name,p.n,p.med,p.from,p.to])") == [["1W", 4, 158, 180, 160], ["7I", 5, 119, 130, 120]],
          a.js("JSON.stringify(distProposals())"))
    a.tab("score")
    check("スコア画面に「見直し案が2件」", "見直し案が2件" in a.text("#prophint"))
    check("実測の表に中央値", "中央" in a.text(".card:has([data-csv])") and "119Y" in a.text(".card:has([data-csv])"))
    a.tab("clubs")
    card = a.text(".card:has([data-prop])")
    check("設定画面に案を出す", "7I：実測の中央値 119Y（5回・105〜131Y）。今の設定は 130Y" in card.replace("\n", "") and a.text('[data-prop="7I"]') == "120Yにする", card)
    a.shot("proposals", full=True)
    a.tap('[data-prop="7I"]')
    check("押した番手だけ変わる", a.js("R.clubs.find(c=>c.name==='7I').dist") == 120 and a.js("R.clubs.find(c=>c.name==='1W').dist") == 180
          and "7Iを120Yにしました（前は130Y）" in a.status() and a.count('[data-prop="7I"]') == 0 and a.count('[data-prop="1W"]') == 1, a.status())
    a.reload()
    check("変えた距離は保存される", a.js("R.clubs.find(c=>c.name==='7I').dist") == 120)
    a.tab("clubs")
    a.tap('[data-prop="1W"]')
    check("案が無くなると説明だけ", a.count("[data-prop]") == 0 and "今は見直し案がありません" in a.text("#app"))
    check("横にはみ出さない", a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def history_filter_and_slim(b, base):
    """履歴：コース別の表示、保存量、1年より前の1打ごとの記録の整理"""
    day = lambda ago: (datetime.date.today() - datetime.timedelta(days=ago)).isoformat()   # ◯日前の日付
    hist = [_hist("30", day(3), "玉川CC", 130, [_shot(1, "7I", 120)], putts=40),
            _hist("20", day(17), "ツインレイクスCC", 140, [_shot(1, "1W", 170)], putts=50),
            _hist("10", day(400), "ツインレイクスCC", 150, [_shot(1, "1W", 160), _shot(2, "7I", 110)], putts=60)]
    del hist[2]["course"]                                     # 前の版の履歴にはコース名が無い
    a = App(b, base).open()
    a.seed(phone_state(holes={}, cur=1, rid=None, hist=hist))
    a.tab("score")
    opts = a.g.locator("#hsel option").all_inner_texts()
    check("コースの選択欄（回数つき）", opts == ["すべてのコース（3回）", "玉川CC（1回）", "ツインレイクスCC（2回）"], opts)
    card = lambda: a.text(".card:has([data-hsave])")
    check("すべて：平均140.0・ベスト130", "140.0" in card() and "130" in card() and a.count("[data-hdel]") == 3, card()[:200])
    a.g.select_option("#hsel", "ツインレイクスCC")
    a.wait(100)
    check("コースを選ぶと、そのコースだけで計算", "145.0" in card() and "55.0" in card() and a.count("[data-hdel]") == 2
          and "コース名の無い古い履歴" not in card(), card()[:200])
    check("保存している量と、控えの状態を出す", "保存している量：約" in a.text("#usage") and "まだ取っていません" in a.text("#usage"), a.text("#usage"))
    check("1年より前の履歴があると、軽くするボタン", a.count("[data-hslim]") == 1 and a.js("slimCount()") == 1)
    a.tap("[data-hslim]")
    check("軽くするのは2回押し", "もう一度押すと" in a.text("[data-hslim]") and a.js("R.hist[2].shots.length") == 2)
    a.tap("[data-hslim]")
    check("1打ごとの記録だけ消え、打数は残る", a.js("R.hist[2].shots.length") == 0 and a.js("R.hist[2].t") == 150 and a.js("R.hist[0].shots.length") == 1
          and a.count("[data-hslim]") == 0 and "1回分" in a.status(), a.status())
    a.reload()
    a.tab("score")
    check("読み直しても選択欄が出る（選んだコースは覚えない）", a.count("#hsel") == 1 and a.count("[data-hdel]") == 3)
    check("横にはみ出さない", a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def backup_roundtrip(b, base):
    """記録の控え：書き出して、別のスマホ（空の状態）へ読み込めること"""
    course = {"name": "テストCC", "base": "r", "tees": [["r", "Regular"]],
              "holes": [{"p": 4, "y": {"r": 300 + i}, "gc": [35.0 + i * 0.001, 139.0], "tc": [35.003 + i * 0.001, 139.0]} for i in range(18)]}
    a = App(b, base).open()
    a.seed(phone_state(hist=[_hist("20", "2026-11-07", "ツインレイクスCC", 140, [_shot(1, "1W", 170)])], rid=None, holes={}, cur=1))
    a.tab("clubs")
    a.g.fill('[data-dist="6"]', "121")                       # 7I を 121Y に
    a.g.dispatch_event('[data-dist="6"]', "change")
    a.g.fill("#cjson", json.dumps(course))
    a.tap("[data-cadd]", wait=150)                            # 追加したコースで途中まで記録
    a.tab("hole")
    a.hit("7I")
    a.tap("[data-add]")
    a.js("()=>{R.fix={tamagawa:{3:[36.0275,139.2889]}};R.rdate='2026-11-15';save()}")
    a.tab("clubs")
    a.tap('[data-bk="copy"]', wait=250)
    text = a.clip()
    j = json.loads(text)
    check("控えの中身", j["app"] == "golf-kouryaku" and len(j["data"]["hist"]) == 1 and len(j["data"]["courses"]) == 1
          and j["data"]["clubs"][6] == {"name": "7I", "dist": 121} and j["ver"] == VER, list(j["data"].keys()))
    check("控えを取った日を覚える", a.js("R.bkAt") == a.js("ymd()") and a.js("ymd()") in a.text(".card:has([data-bk])"))
    with a.g.expect_download() as dl:
        a.tap('[data-bk="file"]', wait=200)
    name = dl.value.suggested_filename
    path = dl.value.path()
    check("ファイルでも保存できる", name.startswith("golf-kouryaku-backup-") and name.endswith(".txt")
          and json.load(open(path, encoding="utf8"))["app"] == "golf-kouryaku", name)
    a.close()

    # ---- 別のスマホ（何も入っていない）で読み込む ----
    n = App(b, base).open()
    n.tab("clubs")
    n.tap('[data-bk="load"]')
    check("何も貼らずに押すと案内", "貼り付けるか" in n.status())
    n.g.fill("#bktext", "これは控えではありません")
    n.tap('[data-bk="load"]')
    check("読めない文は断る", "控えとして読めません" in n.text("#bkinfo"), n.text("#bkinfo"))
    n.g.fill("#bktext", json.dumps({"app": "other", "data": {}}))
    n.tap('[data-bk="load"]')
    check("ほかのアプリの文は断る", "このアプリの控えではありません" in n.text("#bkinfo"))
    n.g.fill("#bktext", text)
    n.tap('[data-bk="load"]')
    check("1回目は中身を知らせるだけ", "履歴1件・番手12本・追加したコース1件" in n.text("#bkinfo") and "もう一度押すと" in n.text('[data-bk="load"]')
          and n.js("(R.hist||[]).length") == 0 and n.g.input_value("#bktext") == text, n.text("#bkinfo"))
    n.tap('[data-bk="load"]', wait=150)
    check("2回目で読み込む", "読み込みました" in n.text("#bkinfo") and n.js("R.hist.length") == 1 and n.js("R.hist[0].shots[0].dist") == 170)
    check("番手の距離が戻る", n.js("R.clubs[6]") == {"name": "7I", "dist": 121})
    check("追加したコースと、途中の記録が戻り、そのコースが開く", n.js("CO.name") == "テストCC" and n.js("strokes(H(1))") == 2
          and n.js("R.holes[1].shots.map(s=>s.r)") == ["ok", "add"] and n.js("R.rdate") == "2026-11-15", n.js("CO.name"))
    check("グリーンの登録が戻る", n.js("R.fix.tamagawa[3]") == [36.0275, 139.2889])
    n.reload()
    check("読み直しても残る", n.js("CO.name") == "テストCC" and n.js("R.hist.length") == 1)
    # ---- 記録のあるスマホに、古い控えを読み込む（合わせる） ----
    n.js("()=>{R.hist.unshift({id:'99',date:'2026-11-21',tee:'w',course:'玉川CC',n:18,t:128,o:60,i:68,p:71,a:{bunker:0,miss:0,ob:0,putts:38},holes:[],shots:[]});H(2).quick=6;save()}")
    n.tab("clubs")
    n.g.fill("#bktext", text)
    n.tap('[data-bk="load"]', '[data-bk="load"]', wait=150)
    check("控えに無い新しいラウンドは消えない", n.js("R.hist.map(x=>x.id)") == ["99", "20"], n.js("R.hist.map(x=>x.id)"))
    check("この端末の途中の記録は、控えで上書きしない", n.js("H(2).quick") == 6 and n.js("strokes(H(1))") == 2)
    # ---- 同じラウンドが、控えと端末の両方にあるとき：新しく保存したほうを残す ----
    old_bk = json.loads(text)
    old_bk["data"]["hist"] = [dict(_hist("50", "2026-11-21", "玉川CC", 60, n=9), at=1000),   # 控え：9ホールの時点で取った（古い）
                              dict(_hist("51", "2026-11-14", "玉川CC", 120), at=3000),       # 控えのほうが新しい
                              _hist("52", "2026-11-07", "ツインレイクスCC", 70, n=9),         # 保存した時刻なし：ホール数が少ない
                              _hist("53", "2026-10-25", "ツインレイクスCC", 147)]              # 保存した時刻なし：ホール数は同じ
    n.js("h=>{R.hist=h;save();render()}", [dict(_hist("50", "2026-11-21", "玉川CC", 128), at=2000), dict(_hist("51", "2026-11-14", "玉川CC", 110, n=9), at=2000),
                                          _hist("52", "2026-11-07", "ツインレイクスCC", 140), _hist("53", "2026-10-25", "ツインレイクスCC", 150)])
    n.g.fill("#bktext", json.dumps(old_bk))
    n.tap('[data-bk="load"]', '[data-bk="load"]', wait=150)
    got = n.js("Object.fromEntries(R.hist.map(x=>[x.id,x.t]))")
    check("古い控えを読み込んでも、あとで保存し直したラウンド（18ホール）は9ホールに戻らない", got.get("50") == 128, got)
    check("控えのほうが新しいラウンドは、控えの内容になる", got.get("51") == 120, got)
    check("保存した時刻が分からない記録は、ホール数の多いほうを残す。同じなら控え", got.get("52") == 140 and got.get("53") == 147, got)
    n.js("()=>{R.cur=1;render()}")
    n.tab("score")
    n.tap("[data-hsave]")
    check("履歴に保存すると、保存した時刻が付く", n.js("(R.hist.find(x=>x.id===R.rid)||{}).at") > 1e12, n.js("R.rid"))
    n.tab("clubs")
    # ---- 危ない中身 ----
    evil = json.loads(text)
    evil["data"]["hist"] = [{"id": "<img src=x onerror=alert(1)>", "date": "2026-11-01", "tee": "w", "course": "<script>alert(1)</script>悪い",
                             "n": "18", "t": "<b>1</b>", "a": {"putts": "<i>x</i>"}, "holes": ["<u>"], "shots": [{"h": 1, "c": "<s>7I", "r": "ok", "dist": "x"}, {"r": "evil"}]},
                            {"id": "ok1", "date": "not-a-date"}]
    evil["data"]["clubs"] = [{"name": "<b>X", "dist": 99999}, {"name": "7I", "dist": 125}]
    n.g.fill("#bktext", json.dumps(evil))
    n.tap('[data-bk="load"]', '[data-bk="load"]', wait=150)
    n.tab("score")
    h = n.js("R.hist.find(x=>x.date==='2026-11-01')")
    check("危ない文字や形のおかしい値は取り除く", h["t"] == 0 and h["a"]["putts"] == 0 and "<" not in h["id"] + h["course"] and h["holes"] == [None]
          and len(h["shots"]) == 1 and h["shots"][0]["c"] == "s7I" and "dist" not in h["shots"][0]
          and n.js("document.querySelectorAll('#app img,#app script,#app [onerror]').length") == 0, h)
    check("形のおかしい番手が混ざっていたら、番手は入れ替えない（番手が減ってしまうのを防ぐ）",
          len(n.js("R.clubs")) == 12 and n.js("R.clubs[6]") == {"name": "7I", "dist": 121} and "変えません" in n.js("U.bkInfo"), n.js("JSON.stringify(R.clubs)"))
    check("日付の無い履歴は読み飛ばす", n.js("R.hist.some(x=>x.id==='ok1')") is False)
    check("エラーなし", n.errors == [], n.errors)
    n.close()

    # ---- ファイルから読み込む／お試しモード中は使えない ----
    f = App(b, base).open()
    f.tab("clubs")
    f.g.set_input_files("#bkfile", {"name": "backup.txt", "mimeType": "text/plain", "buffer": text.encode("utf8")})
    f.wait(200)
    check("ファイルを選ぶと貼り付け欄に入る", f.g.input_value("#bktext") == text and "ファイルを読みました" in f.text("#bkinfo"))
    f.tap('[data-bk="load"]', '[data-bk="load"]', wait=150)
    check("ファイルからも戻せる", f.js("R.hist.length") == 1 and f.js("CO.name") == "テストCC")
    f.tap_reload('[data-demo="on"]')
    f.tab("clubs")
    f.tap('[data-bk="copy"]')
    check("お試しモード中は控えを使えない", "お試しモード中は" in f.status())
    check("エラーなし（2）", f.errors == [], f.errors)
    f.close()


@test
def result_text_for_dojo(b, base):
    """結果の文が、上達道場の読み取り方に合っていること（日付はラウンドの日）"""
    a = App(b, base).open()
    a.seed(phone_state(course="tamagawa", holes={}, cur=1, rid=None))
    a.hit("1W")
    a.tap('[data-lie="bunker"]')
    a.hit("SW")
    a.hit("AW", "ob")
    a.hit("AW", "miss")
    a.tap('[data-act="green"]', '[data-putt="1"]', '[data-putt="1"]')
    check("打ち始めた日を覚える", a.js("R.rdate") == a.js("ymd()"))
    a.js("()=>{R.rdate='2026-11-21';save()}")                 # ラウンドは11/21、結果を送るのは後日、という場面
    a.tab("score")
    a.tap("[data-rcopy]", wait=200)
    L = a.clip().split("\n")
    m = re.match(r"^(.*?)\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+アプリ(\S+)$", L[0])      # 上達道場と同じ読み取り方
    check("1行目：コース・ラウンドの日・ティー・版", bool(m) and m.groups() == ("玉川CC", "2026-11-21", "White", VER), L[0])
    check("2行目：合計", L[1] == "合計 7打（1ホール）パット2", L[1])
    check("ホールの表", L[3] == "H,Par,打数,ショット,パット,バンカー,空振り,OB池" and L[4] == "1,5,7,5,2,1,1,1", L[3:5])
    i = L.index("[ショット]")
    check("ショットの表（空振りは入れない）", L[i + 1] == "ホール,番手,結果,残り,球の場所,方向,当たり,実測Y" and L[i + 2:] ==
          ["1,1W,普通,516,FW,,,", "1,SW,普通,336,バンカー,,,", "1,AW,OB,306,FW,,,"], L[i + 1:])
    a.tap("[data-hsave]", wait=80)
    check("履歴の日付もラウンドの日", a.js("R.hist[0].date") == "2026-11-21" and a.js("R.hist[0].rows[0]") ==
          {"n": 1, "p": 5, "s": 7, "sh": 5, "pt": 2, "bk": 1, "ms": 1, "ob": 1} and a.js("R.hist[0].teeName") == "White", a.js("JSON.stringify(R.hist[0].rows)"))
    a.tap("[data-hnew]", "[data-hnew]")
    check("新しいラウンドでは日付を持ち越さない", a.js("R.rdate") is None)
    check("エラーなし", a.errors == [], a.errors)
    a.close()


@test
def send_page(b, base):
    """「上達道場へ渡す」画面（send.html）：一覧、渡す相手の限定、渡せないときのコピー"""
    rows = [{"n": i + 1, "p": 4, "s": 6, "sh": 4, "pt": 2, "bk": 0, "ms": 0, "ob": 0} for i in range(18)]
    new = dict(_hist("30", "2026-11-21", "玉川CC", 108, [_shot(1, "7I", 120)]), rows=rows, teeName="White")
    old = _hist("20", "2026-11-07", "ツインレイクスCC", 90, [_shot(1, "1W", 170, lie="bunker"), _shot(1, "7I", r="ob")])   # rows の無い古い形
    empty = dict(_hist("10", "2026-10-01", "ツインレイクスCC", 140), holes=[])
    # コースを選べなかった頃（v25 まで）の履歴：コース名もティー名も無い
    v25 = {k: v for k, v in _hist("15", "2026-11-03", "", 126).items() if k not in ("course", "teeName")}
    a = App(b, base).open()
    a.seed(phone_state(course="tamagawa", cur=1, rid=None, hist=[new, old, v25, empty],
                       holes={"1": {"shots": [{"c": "1W", "r": "ok", "pen": 0, "before": 516, "lie": "fw"}], "rem": 336, "putts": 0, "green": False}}))
    a.js("([k])=>{localStorage.setItem(k+'-mode','demo');localStorage.setItem(k+'-demo',JSON.stringify({holes:{},clubs:[],hist:[]}))}", [KEY])
    snap_all = "JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))"
    stored = a.js(snap_all)
    a.open("send.html")
    check("この画面を開いても、保存してある記録は1文字も変わらない", a.js(snap_all) == stored)
    items = a.g.locator("button.item").all_inner_texts()
    check("お試しモード中でも本番の記録を出す。打数の無い履歴は出さない", len(items) == 4 and "記録中のラウンド：玉川CC" in items[0]
          and "2026-11-21" in items[1] and "玉川CC" in items[1] and "2026-11-07" in items[2] and "パットの内訳なし" in items[2], items)
    check("コース名の無い古い履歴は、最初のコースの名前で出す", "2026-11-03" in items[3] and "ツインレイクスCC" in items[3], items[3])
    a.tap('button[data-i="1"]', wait=300)
    check("上達道場から開いていないときは、コピーに切り替える", "結果をコピーしました" in a.text("#sendmsg") and a.clip().startswith("玉川CC 2026-11-21 White アプリ"), a.text("#sendmsg"))
    # 上達道場から開かれた場面を作る（opener をにせものに差し替えて、渡す中身と相手を確かめる）
    a.js("()=>{window.__sent=[];window.opener={closed:false,postMessage:(d,o)=>window.__sent.push([d,o])}}")
    a.tap('button[data-i="2"]', wait=200)
    sent = a.js("window.__sent")
    origin = find(r'DOJO_ORIGIN\s*=\s*"([^"]+)"', read("js/send.js"))
    check("渡す相手は上達道場だけ（相手を限定して渡す）", len(sent) == 1 and sent[0][1] == origin and origin.startswith("https://") and "*" not in origin, sent[0][1] if sent else sent)
    t = sent[0][0]["text"].split("\n")
    check("古い履歴：パーをコースから補い、パットは空欄", sent[0][0]["app"] == "golf-kouryaku" and sent[0][0]["kind"] == "round"
          and t[0].startswith("ツインレイクスCC 2026-11-07 White アプリ") and t[4] == "1,4,5,,,1,0,1" and t[5] == "2,3,5,,,0,0,0", t[:6])
    check("渡している間の表示", "渡しています" in a.text("#sendmsg"))
    a.tap('button[data-i="1"]', wait=150)
    check("渡している最中に別のラウンドを押しても、受け付けない（1回に1件）", len(a.js("window.__sent")) == 1 and "渡しています" in a.text("#sendmsg"))
    a.js("o=>window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.example',data:{app:'golf-jotatsu-dojo',kind:'ack'}}))", origin)
    a.wait(100)
    check("ほかのサイトからの返事は相手にしない", "渡しています" in a.text("#sendmsg"))
    a.js("o=>window.dispatchEvent(new MessageEvent('message',{origin:o,data:{app:'golf-jotatsu-dojo',kind:'ack'}}))", origin)
    a.wait(150)
    check("上達道場から返事が来たら「渡しました」", "上達道場へ渡しました（" in a.text("#sendmsg") and "読み取れません" not in a.text("#sendmsg"), a.text("#sendmsg"))
    # コース名の無い古い履歴を渡す：1行目を上達道場が読める形（コース名あり）にする
    a.js("()=>{window.close=()=>{window.__closed=true}}")
    a.tap('button[data-i="3"]', wait=200)
    t3 = a.js("window.__sent")[1][0]["text"].split("\n")
    check("コース名の無い古い履歴：1行目に最初のコースの名前とティー名を入れる（上達道場が日付を読める形）",
          re.match(r"^ツインレイクスCC 2026-11-03 White アプリ\S+$", t3[0]) is not None, t3[0])
    a.js("o=>window.dispatchEvent(new MessageEvent('message',{origin:o,data:{app:'golf-jotatsu-dojo',kind:'ack',ok:false}}))", origin)
    a.wait(150)
    check("上達道場が読み取れなかったと返してきたら、そう伝える（「渡しました」で終わらせない）",
          "読み取れませんでした" in a.text("#sendmsg") and not a.js("!!window.__closed"), a.text("#sendmsg"))
    check("横にはみ出さない", a.width_ok())
    check("エラーなし", a.errors == [], a.errors)
    a.close()
    e = App(b, base).open("send.html")
    check("記録が無いときは案内だけ", e.count("button.item") == 0 and "渡せるラウンドがありません" in e.text("#app"))
    check("何も保存しない（記録の無い端末に、保存場所を作らない）", e.js("localStorage.length") == 0, e.js("Object.keys(localStorage)"))
    check("エラーなし（空）", e.errors == [], e.errors)
    e.close()
    # まだ今の版を1度も開いていないスマホ（前の保存場所だけに記録がある）で、先にこの画面を開いたとき
    o = App(b, base)
    o.g.goto(base + "icon-192.png")
    o.g.evaluate("([k,v])=>localStorage.setItem(k,v)", [OLD_KEY, json.dumps(phone_state(rid=None, hist=[old]))])
    snap = "JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))"
    before = o.js(snap)
    o.open("send.html")
    items = o.g.locator("button.item").all_inner_texts()
    check("前の保存場所だけに記録があるスマホでも、記録中のラウンドと履歴を出せる",
          len(items) == 2 and "記録中のラウンド" in items[0] and "2026-11-07" in items[1], items)
    o.tap('button[data-i="1"]', wait=300)
    check("この画面は、記録の引き継ぎ（コピー）も保存もしない。保存場所を1つも変えない",
          o.js(snap) == before and o.js("k=>localStorage.getItem(k)", KEY) is None, o.js("Object.keys(localStorage)"))
    check("エラーなし（前の保存場所だけ）", o.errors == [], o.errors)
    o.close()


# 上達道場の代わりのページ。本物と同じく、ふつうのリンク（rel="opener" つき）で「上達道場へ渡す」画面を開く
FRAME_HTML = """<!doctype html><meta charset=utf8>
<a id=pull href="%(app)s/send.html" target="_blank" rel="opener">攻略アプリから受け取る</a><pre id=got></pre><script>
const APP_ORIGIN = "%(app)s";
window.addEventListener("message", e => {
  if (e.origin !== APP_ORIGIN || !e.data || e.data.app !== "golf-kouryaku") return;
  document.getElementById("got").textContent = e.data.text;
  e.source.postMessage({app: "golf-jotatsu-dojo", kind: "ack"}, e.origin);
});
</script>"""
OUTER_HTML = """<!doctype html><meta charset=utf8><title>outer</title>
<iframe id=f sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups"
 allow="translator; language-detector; fullscreen; clipboard-write; gamepad; xr-spatial-tracking; screen-wake-lock; autoplay"
 referrerpolicy="no-referrer" src="%(frame)s/frame.html" style="width:100%%;height:300px"></iframe>"""


@test
def dojo_handoff_sandbox(b, base):
    """上達道場と同じ条件（別サイトの中の、制限つきの枠）から開いても、結果が届くこと"""
    tmp = tempfile.mkdtemp(prefix="golf-dojo-")
    site, outer, frame = (os.path.join(tmp, x) for x in ("site", "outer", "frame"))
    shutil.copytree(ROOT, site, ignore=shutil.ignore_patterns(".git", "tests", "tools", "__pycache__", "images.js"))
    os.makedirs(outer)
    os.makedirs(frame)
    s1, app_url = serve(site)
    s2, outer_url = serve(outer)
    s3, frame_url = serve(frame)
    try:
        # 本物の上達道場の場所の代わりに、テスト用の枠の場所を「渡す相手」にする
        src = read("js/send.js")
        real = find(r'DOJO_ORIGIN\s*=\s*"([^"]+)"', src)
        with open(os.path.join(site, "js", "send.js"), "w", encoding="utf8") as f:
            f.write(src.replace(real, frame_url.rstrip("/")))
        with open(os.path.join(frame, "frame.html"), "w", encoding="utf8") as f:
            f.write(FRAME_HTML % {"app": app_url.rstrip("/")})
        with open(os.path.join(outer, "outer.html"), "w", encoding="utf8") as f:
            f.write(OUTER_HTML % {"frame": frame_url.rstrip("/")})
        a = App(b, app_url).open()
        rows = [{"n": i + 1, "p": 4, "s": 6, "sh": 4, "pt": 2, "bk": 0, "ms": 0, "ob": 0} for i in range(18)]
        a.seed(phone_state(course="tamagawa", holes={}, cur=1, rid=None,
                           hist=[dict(_hist("30", "2026-11-21", "玉川CC", 108), rows=rows, teeName="White")]))
        a.g.goto(outer_url + "outer.html")
        fr = a.g.frame_locator("#f")
        with a.g.expect_popup() as pop:
            fr.locator("#pull").click()
        w = pop.value
        w.wait_for_load_state()
        w.wait_for_timeout(300)
        check("制限つきの枠から開いた画面でも、記録を読める", w.locator("button.item").count() == 1 and "玉川CC" in w.inner_text("button.item"), w.inner_text("body")[:120])
        check("開いた元（上達道場の代わり）とつながっている", w.evaluate("!!window.opener"))
        w.click('button[data-i="0"]')
        w.wait_for_timeout(500)
        got = fr.locator("#got").inner_text()
        check("結果が枠へ届く", got.startswith("玉川CC 2026-11-21 White アプリ") and "18,4,6,4,2,0,0,0" in got, got[:60])
        try:
            msg = w.inner_text("#sendmsg")
        except Exception:
            msg = "（画面は閉じた）"
        check("返事を受け取って「渡しました」", "渡しました" in msg or w.is_closed(), msg)
        a.close()
    finally:
        for s in (s1, s2, s3):
            s.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


# Claude の Artifact が、公開するときにページの外側へ付ける枠（読むだけページを同じ条件で開くため）
ARTIFACT_SKELETON = (
    '<!doctype html><html><head><meta charset=utf8>'
    '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}"
    "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>"
    "</head><body>"
)
TINY_PNG = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA"
            "60e6kgAAAABJRU5ErkJggg==")


@test
def guide_page(b, base):
    """読むだけの攻略ノート（tools/build_guide.py）が、アプリと同じ内容で、記録の機能を持たないこと"""
    tool = os.path.join(ROOT, "tools", "build_guide.py")
    if not os.path.exists(tool):
        R.skip("攻略ノート", "tools/build_guide.py が無い")
        return
    import importlib.util
    spec = importlib.util.spec_from_file_location("build_guide", tool)
    build_guide = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build_guide)
    tmp = tempfile.mkdtemp()
    srv = None
    try:
        with open(os.path.join(tmp, "imgs.json"), "w", encoding="utf8") as f:
            json.dump([{"map": TINY_PNG, "tee": TINY_PNG, "green": TINY_PNG}] * 18, f)
        body = build_guide.build(os.path.join(tmp, "imgs.json"))
        check("外側のタグ（doctype・html・head・body）を自分で書いていない",
              not re.search(r"<!doctype|<html[\s>]|<head[\s>]|<body[\s>]", body, re.I))
        check("題名が先頭にある", body.startswith("<title>ゴルフ攻略ノート</title>"), body[:60])
        check("外のサイトから読み込むものが無い（通信できない場所でも読める）",
              not re.search(r"""<script[^>]+src=|<link[^>]+href=|@import""", body))
        with open(os.path.join(tmp, "index.html"), "w", encoding="utf8") as f:
            f.write(ARTIFACT_SKELETON + body + "</body></html>")
        srv, gbase = serve(tmp)

        # アプリ側の値（くらべる相手）
        a = App(b, base).open()
        want = a.js("""()=>({
          names: COURSES.map(c=>c.name),
          pars: COURSES.map(c=>c.holes.reduce((s,d)=>s+d.p,0)),
          y1: COURSES[0].holes[0].y[COURSES[0].base],
          aim1: COURSES[0].holes[0].aim, risk3: COURSES[0].holes[2].risk,
          clubs: R.clubs.map(c=>c.name), fw: bands("fw"), light: bands("light"),
          top3: BASE_TOP3, tip4u: (COURSES[0].clubTips||{})["4U"], key: KEY })""")
        a.close()

        g = App(b, gbase).open(ready=False)  # 攻略ノートには、アプリの起動の印が無い
        g.g.wait_for_selector(".hole")
        check("最初はホールのページで、18ホール分ある", g.count(".hole") == 18, g.count(".hole"))
        check("コース名とパーの合計が出る", (want["names"][0] + "　パー%d" % want["pars"][0]) in g.text("h2"), g.text("h2"))
        check("1番のヤードがアプリと同じ", ("%dY" % want["y1"]) in g.text("#h1 .yards"), g.text("#h1 .yards"))
        check("1番の狙いの文がアプリと同じ", want["aim1"] in g.text("#h1"), g.text("#h1")[:200])
        check("3番の危険の文がアプリと同じ", want["risk3"] in g.text("#h3"), g.text("#h3")[:200])
        check("ホールの簡易図が18枚ある", g.count(".hole svg") == 18, g.count(".hole svg"))
        check("コース全体図に現在地の説明を出さない（GPSを使わない）", "GPS" not in g.text(".wrap"))
        # 記録の機能が無いこと
        check("記録のボタンや下のタブが無い",
              g.count("[data-club], [data-res], [data-putt], [data-act], .tabbar, #scorebar") == 0)
        check("記録の部品（record.js など）を読み込んでいない",
              g.js("typeof shot + typeof saveRound + typeof render") == "undefinedundefinedundefined")
        # ホールへ移動
        g.tap('[data-jump="18"]', wait=250)
        box = g.js("""()=>{const r=document.getElementById('h18').getBoundingClientRect(),
                           t=document.querySelector('.tabs').getBoundingClientRect();return [r.top,t.bottom,innerHeight]}""")
        check("番号を押すとそのホールへ移り、上の帯に隠れない", box[1] - 2 <= box[0] < box[2] / 2, box)
        # 画像
        check("画像は最初は閉じている", g.count(".hole img") == 0)
        g.tap('#h18 [data-pics]', wait=120)
        check("「画像を見る」で全体図が出る", (g.g.get_attribute("#h18 img", "src") or "").startswith("data:image/")
              and g.g.get_attribute('#h18 [data-kind="map"]', "aria-pressed") == "true")
        g.tap('#h18 [data-kind="green"]', wait=120)
        check("グリーンに切り替えると、ピンの注意が出る", "ピン" in g.text("#h18 .pics"), g.text("#h18 .pics"))
        check("画像を開いてもページの位置が飛ばない", abs(g.js("document.getElementById('h18').getBoundingClientRect().top") - box[0]) < 4)
        g.tap('#h18 [data-kind=""]', wait=120)
        check("「画像を閉じる」で閉じる", g.count(".hole img") == 0)
        g.shot("guide_holes")
        # コースの切り替え
        g.tap('[data-course="tamagawa"]', wait=150)
        check("玉川CCへ切り替わる", (want["names"][1] + "　パー%d" % want["pars"][1]) in g.text("h2") and g.count(".hole") == 18, g.text("h2"))
        check("画像の無いコースには「画像を見る」を出さない", g.count("[data-pics]") == 0)
        check("横にはみ出さない（ホール）", g.width_ok())
        g.reload(ready=False)
        check("選んだコースを覚えている", want["names"][1] in g.text("h2"), g.text("h2"))
        g.tap('[data-course="twinlakes"]', wait=150)
        # 番手
        g.js("location.hash='clubs'")
        g.wait(200)
        check("番手のページに全部の番手がある", g.count(".clubhead") == len(want["clubs"]), g.count(".clubhead"))
        check("コーチの教えと、このコースだけの注意が出る",
              "コーチの教え" in g.text(".wrap") and want["tip4u"] in g.text(".wrap"))
        check("横にはみ出さない（番手）", g.width_ok())
        g.shot("guide_clubs")
        # 残り距離
        g.js("location.hash='distance'")
        g.wait(200)
        got = g.js("""()=>[...document.querySelectorAll('.two table')].map(t=>[...t.querySelectorAll('tbody tr')]
                       .map(r=>[...r.cells].map(c=>c.textContent)))""")
        check("残り距離の表がアプリと同じ", got == [want["fw"], want["light"]], got)
        check("横にはみ出さない（残り距離）", g.width_ok())
        # コーチ
        g.js("location.hash='coach'")
        g.wait(200)
        check("当日の3つがアプリと同じ", g.js("[...document.querySelectorAll('ol.plain li')].map(x=>x.textContent)") == want["top3"])
        check("横にはみ出さない（コーチ）", g.width_ok())
        check("今のページの印が付く", g.text('.tabs [aria-current="page"]') == "コーチ")
        g.js("location.hash='nazo'")
        g.wait(200)
        check("知らない名前のときはホールのページを出す", g.count(".hole") == 18)
        check("アプリの記録の保存場所にさわらない", g.js("k=>localStorage.getItem(k)===null && localStorage.getItem(k+'-demo')===null", want["key"]))
        check("画面にエラーが出ていない", not g.errors, g.errors)
        g.close()
        # 暗い表示
        d = App(b, gbase, dark=True).open(ready=False)
        d.g.wait_for_selector(".hole")
        bg = d.js("getComputedStyle(document.body).backgroundColor")
        rgb = [int(x) for x in re.findall(r"\d+", bg)[:3]]
        check("暗い表示では背景が暗くなる", sum(rgb) < 200, bg)
        d.shot("guide_dark")
        d.close()
    finally:
        if srv:
            srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


@test
def layout_all_tabs(b, base):
    """5つの画面が、幅360・390、明るい表示・暗い表示で横にはみ出さないこと"""
    bad = []
    for width in (360, 390):
        for dark in (False, True):
            a = App(b, base, width=width, dark=dark).open()
            a.seed(phone_state(course="tamagawa", holes={"1": {"shots": [
                {"c": "1W", "r": "ok", "pen": 0, "before": 516, "lie": "fw", "dist": 180, "from": [36.01813, 139.29025], "to": [36.0196, 139.2899]},
                {"c": "7I", "r": "ok", "pen": 0, "before": 336, "lie": "fw"}], "rem": 206, "putts": 0, "green": False}}, cur=1, rid=None))
            for v in ["hole", "score", "advice", "clubs", "coach"]:
                a.tab(v)
                if not a.width_ok():
                    bad.append((width, dark, v, a.js("document.documentElement.scrollWidth")))
                a.shot("layout_%d_%s_%s" % (width, "dark" if dark else "light", v), full=True)
            for sub in ["chart", "lie"]:
                a.tab("advice")
                a.tap('[data-adv="%s"]' % sub)
                if not a.width_ok():
                    bad.append((width, dark, "advice-" + sub))
            if a.errors:
                bad.append(("error", a.errors))
            a.close()
    check("どの組み合わせでもはみ出さず、エラーもない", not bad, bad)


def _copy_site(dst, drop=()):
    """公開するファイルを dst に置く（tests・tools は置かない）。drop に書いたファイルは、わざと置かない。"""
    for name in os.listdir(ROOT):
        if name in (".git", ".github", "tests", "tools", "__pycache__", "node_modules", "README.md", "_site"):
            continue
        a, c = os.path.join(ROOT, name), os.path.join(dst, name)
        if os.path.isdir(a):
            shutil.copytree(a, c, dirs_exist_ok=True)
        else:
            shutil.copy(a, c)
    for f in drop:
        os.remove(os.path.join(dst, f))


def _site_v28(dst):
    """v28（分ける前の版）の公開内容を dst に置く。画面と保存係は tests/fixtures の控え、本体は今も置いてある app.js。"""
    os.makedirs(dst, exist_ok=True)
    fx = os.path.join(ROOT, "tests", "fixtures")
    shutil.copy(os.path.join(fx, "index_v28.html"), os.path.join(dst, "index.html"))
    shutil.copy(os.path.join(fx, "sw_v28.js"), os.path.join(dst, "sw.js"))
    for f in ("app.js", "images.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"):
        shutil.copy(os.path.join(ROOT, f), os.path.join(dst, f))


def _bar(a):
    """上の帯の文字（無ければ空）。"""
    try:
        return a.g.inner_text("#scorebar", timeout=1500).replace("\n", " | ")
    except Exception:
        return ""


@test
def boot_all_or_nothing(b, base):
    """起動：ファイルが全部そろったときだけ動く。そろわない時は、前の版で動かすか、読み込み直しを案内する"""
    tmp = tempfile.mkdtemp(prefix="golf-boot-")
    site = os.path.join(tmp, "site")
    os.makedirs(site)
    _copy_site(site, drop=["js/maps.js"])  # 1つだけ欠けた状態（公開の途中や、電波が弱くて1つ落ちた時）
    srv, url = serve(site)
    try:
        # 1) はじめての端末（記録なし）
        a = App(b, url).open(ready=False, wait=1200)
        check("1つ欠けていたら、何も動かさずに案内を出す",
              a.count("#retry") == 1 and "読み込めませんでした" in a.text("#app") and a.js("typeof APP_VER") == "undefined",
              a.text("#app")[:80])
        check("画面のエラーは出ていない（中途半端に動いていない）", a.errors == [], a.errors)
        shutil.copy(os.path.join(ROOT, "js", "maps.js"), os.path.join(site, "js", "maps.js"))
        with a.g.expect_navigation():
            a.g.click("#retry")
        a.ready()
        check("そろえば、「もう一度読み込む」で動く", VER in _bar(a), _bar(a))
        a.close()
        os.remove(os.path.join(site, "js", "maps.js"))

        # 2) 前の版（v28まで）の記録だけがある端末 → 端末に残っている前の版で動かす
        a = App(b, url)
        a.g.goto(url + "icon-192.png")
        a.g.evaluate("([k,v])=>localStorage.setItem(k,v)", [OLD_KEY, json.dumps(phone_state(cur=1))])
        a.open(ready=False, wait=1500)
        check("前の版の記録だけがある端末は、前の版で動く（画面が空にならない）",
              "v28" in _bar(a) and a.js("R.hist.length") == 1 and a.js("typeof APP_VER") == "undefined", _bar(a))
        a.hit("7I")
        for v in ["score", "advice", "clubs", "coach", "hole"]:
            a.tab(v)
        check("前の版で記録でき、全部の画面を開ける。新しい保存場所は作らない",
              a.js("k=>JSON.parse(localStorage.getItem(k)).holes[1].shots.length", OLD_KEY) == 1
              and a.js("k=>localStorage.getItem(k)", KEY) is None and a.errors == [], a.errors)
        a.close()

        # 3) 今の版が1度でも動いた端末 → 前の版では動かさない（記録が2か所に分かれるのを防ぐ）
        a = App(b, url)
        a.g.goto(url + "icon-192.png")
        a.g.evaluate("([k1,k2,v])=>{localStorage.setItem(k1,v);localStorage.setItem(k2,v)}", [OLD_KEY, KEY, json.dumps(phone_state())])
        a.open(ready=False, wait=1200)
        check("今の版が動いたことのある端末は、前の版で動かさず、案内を出す",
              a.count("#retry") == 1 and a.count("#scorebar") == 0, a.text("#app")[:60])
        a.close()

        # 4) 時間がかかるとき（1つが返ってこない）
        shutil.copy(os.path.join(ROOT, "js", "maps.js"), os.path.join(site, "js", "maps.js"))
        SLOW.add("/js/gps.js")  # このファイルだけ、返事が9秒遅れる
        a = App(b, url)
        a.g.goto(url + "icon-192.png")
        a.g.evaluate("([k,v])=>localStorage.setItem(k,v)", [OLD_KEY, json.dumps(phone_state())])
        a.open(ready=False, wait=3000)
        check("待っている間は「読み込んでいます」", a.count("#loading") == 1 and a.count("#scorebar") == 0)
        a.wait(4200)
        check("6秒たっても そろわなければ、前の版に切り替える（前の版の記録だけがある端末）", "v28" in _bar(a), _bar(a))
        a.wait(3500)
        check("遅れてそろっても、動いている前の版はそのまま（途中で入れ替えない）",
              "v28" in _bar(a) and a.js("typeof APP_VER") == "undefined" and a.errors == [], a.errors)
        a.close()
        a = App(b, url)
        a.open(ready=False, wait=7200)
        check("はじめての端末は、そろうまで待つ（前の版には切り替えない）", a.count("#loading") == 1 and a.count("#scorebar") == 0)
        a.ready()
        check("遅れても、そろえば動く", VER in _bar(a) and a.errors == [], a.errors)
        a.close()
        SLOW.clear()
    finally:
        SLOW.clear()
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


@test
def transition_from_v28(b, base):
    """v28 が入っているスマホを v29 に上げる：途中でファイルが欠けても前の版で動き続け、そろえば記録ごと引き継ぐ"""
    tmp = tempfile.mkdtemp(prefix="golf-move-")
    site = os.path.join(tmp, "site")
    _site_v28(site)
    srv, url = serve(site)
    try:
        a = App(b, url, sw="allow").open(ready=False, wait=2800)  # v28 には起動の印が無いので、決まった時間だけ待つ
        a.g.evaluate("([k,v])=>localStorage.setItem(k,v)", [OLD_KEY, json.dumps(phone_state(cur=1))])
        a.reload(900, ready=False)
        check("v28 が動いている（保存係も v28）", "v28" in _bar(a) and a.js("caches.keys()") == ["twinlakes-v28"], (_bar(a), a.js("caches.keys()")))
        a.hit("1W")
        check("v28 で1打足した（1番が1打）", a.js("k=>JSON.parse(localStorage.getItem(k)).holes[1].shots.length", OLD_KEY) == 1)

        # ---- v29 を公開。ただし1つ欠けている ----
        _copy_site(site, drop=["js/maps.js"])
        a.errors.clear()
        a.reload(2500, ready=False)
        check("欠けている間は、前の版で動き続ける（画面が空にならない）",
              "v28" in _bar(a) and a.js("R.holes[1].shots.length") == 1 and a.js("typeof APP_VER") == "undefined", _bar(a))
        a.ctx.set_offline(True)
        a.reload(2500, ready=False)
        check("そのまま電波がなくなっても、前の版で動く", "v28" in _bar(a) and a.js("R.holes[1].shots.length") == 1, _bar(a))
        a.hit("7I")
        check("前の版で記録を続けられる（1番が2打）", a.js("k=>JSON.parse(localStorage.getItem(k)).holes[1].shots.length", OLD_KEY) == 2
              and a.js("k=>localStorage.getItem(k)", KEY) is None)
        check("ここまで画面のエラーなし", a.errors == [], a.errors)
        a.ctx.set_offline(False)

        # ---- 欠けていたファイルがそろう ----
        shutil.copy(os.path.join(ROOT, "js", "maps.js"), os.path.join(site, "js", "maps.js"))
        a.reload(600, ready=False)
        a.switched(VER)  # 今の版で起動 → 保存係が全部取りこむ → 自動で1回読み直す
        check("そろったら、今の版に入れ替わる", VER in _bar(a) and VER in a.text("#verline"), _bar(a))
        a.wait(1500)     # 前の保存係が、入れ替わりの最中の返事を遅れて書きこむことがある（保存場所ができ直す）
        a.reload(600)    # 次に開いたときに、新しい保存係が片付ける
        check("保存係の保存場所は、今の版のものだけ（前の保存係の残りは、開き直すと片付く）",
              a.js("caches.keys()") == ["golf-kouryaku-" + VER], a.js("caches.keys()"))
        check("前の版で足した分も含めて、記録を引き継ぐ（1番2打・9番1打・履歴1件）",
              a.js("R.holes[1].shots.length") == 2 and a.js("R.holes[9].shots.length") == 1 and a.js("R.hist.length") == 1,
              a.js("JSON.stringify([R.holes[1].shots.length,R.hist.length])"))
        a.ctx.set_offline(True)
        a.reload(900)
        for v in ["score", "advice", "clubs", "coach", "hole"]:
            a.tab(v)
        check("入れ替わったあと、電波なしで全部の画面を開ける", VER in _bar(a) and a.errors == [], a.errors)
        a.close()

        # ---- もう1台：今の版の画面は動いたが、保存係の取りこみだけ失敗した場合 ----
        shutil.rmtree(site)
        _site_v28(site)
        c = App(b, url, sw="allow").open(ready=False, wait=2800)
        c.g.evaluate("([k,v])=>localStorage.setItem(k,v)", [OLD_KEY, json.dumps(phone_state(cur=1))])
        c.reload(900, ready=False)
        check("（2台目）v28 が動いている", "v28" in _bar(c) and c.js("caches.keys()") == ["twinlakes-v28"], _bar(c))
        _copy_site(site, drop=["send.html"])  # 画面の起動には要らないが、保存係の取りこみには要るファイル
        c.reload(600, ready=False)
        c.ready()
        c.wait(2500)
        check("今の版の画面が動く。保存係は前の版のまま（取りこみに失敗したため、前の版の保存場所が残っている）",
              VER in _bar(c) and "twinlakes-v28" in c.js("caches.keys()"), (_bar(c), c.js("caches.keys()")))
        check("記録は新しい保存場所へ引き継いだ", c.js("R.hist.length") == 1 and c.js("k=>localStorage.getItem(k)!==null", KEY))
        c.ctx.set_offline(True)
        c.g.goto(url)  # ホーム画面のアイコンではなく、「/」で終わる住所（古い入口）から開く
        c.wait(3200)
        check("電波なしで古い入口から開いても、今の版が動く（前の版は動かない）",
              VER in _bar(c) and c.js("typeof APP_VER") == "string", _bar(c))
        old_before = c.js("k=>localStorage.getItem(k)", OLD_KEY)
        c.hit("7I")
        check("そこで足した1打は、新しい保存場所に入る（記録が2か所に分かれない）",
              c.js("k=>JSON.parse(localStorage.getItem(k)).holes[1].shots.length", KEY) == 1
              and c.js("k=>localStorage.getItem(k)", OLD_KEY) == old_before)
        c.ctx.set_offline(False)
        shutil.copy(os.path.join(ROOT, "send.html"), os.path.join(site, "send.html"))
        c.g.goto(url + "index.html")
        c.switched(VER)
        check("あとで保存係が入れ替わっても、足した1打が見える", VER in _bar(c) and c.js("R.holes[1].shots.length") == 1, _bar(c))
        c.wait(1500)
        c.reload(600)
        check("（2台目）保存係の保存場所は、今の版のものだけ", c.js("caches.keys()") == ["golf-kouryaku-" + VER], c.js("caches.keys()"))
        check("エラーなし（2台目）", c.errors == [], c.errors)
        c.close()

        # ---- 3台目：今の版のアプリより先に「上達道場へ渡す」画面だけを開き、保存係の取りこみにも失敗した場合 ----
        shutil.rmtree(site)
        _site_v28(site)
        d = App(b, url, sw="allow").open(ready=False, wait=2800)
        d.g.evaluate("([k,v])=>localStorage.setItem(k,v)", [OLD_KEY, json.dumps(phone_state(cur=1))])
        d.reload(900, ready=False)
        _copy_site(site, drop=["icon-512.png"])  # 保存係の取りこみにだけ要るファイルを欠けさせる
        d.g.goto(url + "send.html")
        d.wait(1800)
        check("（3台目）渡す画面は、前の保存場所の記録を読める。新しい保存場所は作らない",
              d.count("button.item") >= 1 and d.js("Object.keys(localStorage)") == [OLD_KEY], d.js("Object.keys(localStorage)"))
        d.ctx.set_offline(True)
        d.g.goto(url + "index.html")
        d.wait(3200)
        check("（3台目）そのあと電波なしでアプリを開くと、前の版が動く（今の版はまだ1度も動いていない）", "v28" in _bar(d), _bar(d))
        d.hit("7I")
        d.ctx.set_offline(False)
        shutil.copy(os.path.join(ROOT, "icon-512.png"), os.path.join(site, "icon-512.png"))
        d.g.goto(url + "index.html")
        d.switched(VER)
        check("（3台目）今の版に入れ替わると、前の版で足した1打も引き継がれている（記録が2か所に分かれない）",
              VER in _bar(d) and d.js("R.holes[1].shots.length") == 1 and d.js("R.hist.length") == 1, _bar(d))
        check("エラーなし（3台目）", d.errors == [], d.errors)
        d.close()
    finally:
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


@test
def stale_copy_guard(b, base):
    """公開の直後に、配信の中継（CDN）が前の版の画面を返しても、保存係が古い画面を取りこまないこと"""
    tmp = tempfile.mkdtemp(prefix="golf-stale-")
    site = os.path.join(tmp, "site")
    _site_v28(site)
    srv, url = serve(site)
    with open(os.path.join(ROOT, "tests", "fixtures", "index_v28.html"), "rb") as f:
        old_html = f.read()
    mark = '<script id="boot">'  # 今の作りの画面に必ず入っている目印（起動係）
    cache_name = "golf-kouryaku-" + VER
    try:
        a = App(b, url, sw="allow").open(ready=False, wait=2800)
        a.g.evaluate("([k,v])=>localStorage.setItem(k,v)", [OLD_KEY, json.dumps(phone_state(cur=1))])
        a.reload(900, ready=False)
        check("v28 が動いている（保存係も v28）", "v28" in _bar(a) and a.js("caches.keys()") == ["twinlakes-v28"], _bar(a))
        check("見本の前の版の画面には、目印（起動係）が無い", mark.encode() not in old_html)

        # ---- v29 を公開。ただし画面（index.html）だけは、中継に残った前の版の写しが返る ----
        _copy_site(site)
        STALE.update({"/": old_html, "/index.html": old_html})
        a.errors.clear()
        a.reload(600, ready=False)
        end = time.time() + 20
        while time.time() < end and cache_name not in a.js("caches.keys()"):
            a.wait(250)  # 新しい保存係が取りこみを始める（保存場所ができる）のを待つ
        tried = cache_name in a.js("caches.keys()")
        a.wait(2500)     # 取りこみが（失敗で）終わるのを待つ
        check("新しい保存係は取りこみを試みた", tried, a.js("caches.keys()"))
        check("前の版の画面が届く間は、保存係を入れ替えない（前の版で動き続ける）",
              "v28" in _bar(a) and not a.sw_active(VER) and "twinlakes-v28" in a.js("caches.keys()"),
              (_bar(a), a.js("caches.keys()")))
        check("古い画面を、新しい保存場所に入れていない",
              a.js("k=>caches.open(k).then(c=>Promise.all([c.match('./'),c.match('index.html')])).then(r=>!r[0]&&!r[1])", cache_name))
        a.hit("1W")
        a.ctx.set_offline(True)
        a.reload(2500, ready=False)
        check("そのまま電波がなくなっても、前の版で開け、記録も続けられる",
              "v28" in _bar(a) and a.js("R.holes[1].shots.length") == 1 and a.js("k=>localStorage.getItem(k)", KEY) is None, _bar(a))
        a.ctx.set_offline(False)

        # ---- 中継の写しが新しくなる ----
        STALE.clear()
        a.reload(600, ready=False)
        a.switched(VER)
        check("今の版の画面が届くようになったら、保存係が入れ替わる", VER in _bar(a) and VER in a.text("#verline"), _bar(a))
        got = a.js("k=>caches.open(k).then(c=>Promise.all(['./','index.html'].map(u=>c.match(u).then(r=>r?r.text():''))))", cache_name)
        check("取りこんだ画面は、2つの入口とも今の版（起動係つき）", all(mark in t for t in got), [t[:60] for t in got])
        check("前の版で足した分も含めて、記録を引き継ぐ（1番1打・9番1打・履歴1件）",
              a.js("R.holes[1].shots.length") == 1 and a.js("R.holes[9].shots.length") == 1 and a.js("R.hist.length") == 1)
        a.ctx.set_offline(True)
        a.reload(900)
        for v in ["score", "advice", "clubs", "coach", "hole"]:
            a.tab(v)
        check("入れ替わったあと、電波なしでも今の版で全部の画面を開ける", VER in _bar(a) and a.errors == [], a.errors)
        a.close()
    finally:
        STALE.clear()
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


@test
def offline_and_update(b, base):
    """電波なしで動くこと、新しい版に自動で入れ替わること（保存係 sw.js の動き）"""
    tmp = tempfile.mkdtemp(prefix="golf-test-")
    site = os.path.join(tmp, "site")
    shutil.copytree(ROOT, site, ignore=shutil.ignore_patterns(".git", "tests", "tools", "__pycache__", "node_modules"))
    srv, url = serve(site)
    try:
        a = App(b, url, sw="allow").open(wait=1800)
        a.reload(900)
        check("保存係が動いている", a.js("navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))"))
        cached = a.js("caches.keys().then(async ks=>{let n=[];for(const k of ks){n=n.concat((await (await caches.open(k)).keys()).map(r=>new URL(r.url).pathname.replace(/^\\//,'')))}return n})")
        need = ["index.html", "send.html", "js/main.js", "js/courses.js", "js/version.js", "images.js"]
        check("必要なファイルを端末に保存している", all(any(c == n or c.endswith("/" + n) for c in cached) for n in need), cached)
        a.hit("1W")
        a.ctx.set_offline(True)
        a.reload(900)
        check("電波なしでも開き、記録が残っている", a.js("R.holes[1].shots.length") == 1 and VER in a.text("#scorebar"))
        for v in ["score", "advice", "clubs", "coach", "hole"]:
            a.tab(v)
        check("電波なしで全部の画面を開ける", a.errors == [] and a.count(".clubs") == 1, a.errors)
        a.open("send.html", wait=600)
        check("電波なしで「上達道場へ渡す」画面も開ける", "上達道場" in a.text("body"), a.text("body")[:80])
        a.open("index.html", wait=600)
        a.ctx.set_offline(False)
        # 新しい版を置く（版番号と、画面に出る文を変える）
        v = read("js/version.js")
        new_ver = "v" + str(int(VER[1:]) + 1)
        with open(os.path.join(site, "js", "version.js"), "w", encoding="utf8") as f:
            f.write(v.replace('"' + VER + '"', '"' + new_ver + '"'))
        a.reload(600)       # 1回目：古い版のまま開き、裏で新しい版を取りこむ
        a.switched(new_ver)  # 取りこみが終わると、自動で読み直す
        check("新しい版に自動で入れ替わる", new_ver in a.text("#scorebar"), a.text("#scorebar"))
        keys = a.js("caches.keys()")
        check("古い版の保存は消える", len(keys) == 1 and new_ver in keys[0], keys)
        check("入れ替わっても記録は残る", a.js("R.holes[1].shots.length") == 1)
        a.ctx.set_offline(True)
        a.reload(900)
        check("入れ替わった後も電波なしで動く", new_ver in a.text("#scorebar"))
        check("エラーなし", a.errors == [], a.errors)
        a.close()
    finally:
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)


# =================================================================================
def main():
    args = [x for x in sys.argv[1:] if not x.startswith("-")]
    if "--list" in sys.argv:
        for t in TESTS:
            print(t.__name__.ljust(28), (t.__doc__ or "").strip())
        return 0
    picked = [t for t in TESTS if not args or any(x in t.__name__ for x in args)]
    srv, base = serve(ROOT)
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for t in picked:
            R.group = t.__name__
            for attempt in range(RETRY + 1):
                print("\n■ " + t.__name__ + "：" + (t.__doc__ or "").strip() + ("（やり直し）" if attempt else ""))
                m = R.mark()
                try:
                    t(browser, base)
                except Exception as e:  # テスト自体がこけたら、失敗として数えて次へ進む
                    R.check("途中で止まった", False, repr(e))
                if len(R.bad) == m[1] or attempt == RETRY:
                    break
                R.rollback(m)  # 失敗があった：この場面の結果を捨てて、もう1回だけ試す
                R.retried.append(t.__name__)
        browser.close()
    srv.shutdown()
    print("\n===== 結果：版 %s／合格 %d・失敗 %d・省略 %d（%.0f秒） =====" % (VER, len(R.ok), len(R.bad), len(R.skipped), time.time() - t0))
    if R.retried:
        print("  やり直した場面（1回目は失敗）: " + ", ".join(R.retried))
    for x in R.bad:
        print("  失敗: " + x)
    return 1 if R.bad else 0


if __name__ == "__main__":
    sys.exit(main())
