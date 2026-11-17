#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""攻略ノート（読むだけのページ）を作る

アプリと同じファイル（コースデータ・アドバイスの文・図と番手の表の作り方）を1つのHTMLにまとめます。
できたHTMLは、Claude の Artifact として公開するためのものです（<html> や <body> は付けません）。

使い方（リポジトリのいちばん上のフォルダで）:

    python3 tools/build_guide.py 出力先.html                      # 画像なし
    python3 tools/build_guide.py 出力先.html --images imgs.json   # ツインレイクスの画像つき

imgs.json は、18ホール分の {"map": 画像, "tee": 画像, "green": 画像}（画像は data: で始まる文字）の並びです。
画像は公開リポジトリに置かないので、手元のファイルを指定します。
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# アプリから借りるファイル（順番に意味がある）
SHARED = ["version", "courses", "advice", "core", "suggest", "gps", "maps"]


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf8") as f:
        return f.read()


def build(images=None):
    pics = ""
    if images:
        with open(images, encoding="utf8") as f:
            data = json.load(f)
        assert isinstance(data, list) and len(data) == 18, "画像は18ホール分の並びにしてください"
        pics = "const PICS = " + json.dumps({"twinlakes": data}, ensure_ascii=False, separators=(",", ":")) + ";\n"
    scripts = "\n".join("/* ===== js/%s.js ===== */\n%s" % (n, read("js", n + ".js")) for n in SHARED)
    return (
        "<title>ゴルフ攻略ノート</title>\n"
        '<meta name="claude:viewport-fit-sides" content="cover">\n'
        "<style>\n" + read("tools", "guide", "guide.css") + "</style>\n"
        '<main class="wrap" id="app"></main>\n'
        "<script>\n"
        "window.READ_ONLY = true; /* 読むだけのページ（記録の引き継ぎも保存もしない） */\n"
        + pics + scripts + "\n/* ===== tools/guide/guide.js ===== */\n" + read("tools", "guide", "guide.js")
        + "</script>\n"
    )


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1
    images = args[args.index("--images") + 1] if "--images" in args else None
    html = build(images)
    with open(args[0], "w", encoding="utf8") as f:
        f.write(html)
    print("作りました: %s（%d KB、画像%s）" % (args[0], len(html.encode("utf8")) // 1024, "あり" if images else "なし"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
