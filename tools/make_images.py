#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ホールの画像ファイル（images.js）を作り直す

ホールの画像は、合言葉を知っている人だけが開けるように、暗号にして images.js に入れています
（このリポジトリは誰でも見られるため）。画像を入れ替えるときだけ、このスクリプトを使います。

使い方（リポジトリのいちばん上のフォルダで）:

    pip install cryptography                                  # 最初の1回だけ（暗号の部品を入れる）
    IMG_PASS=合言葉 python3 tools/make_images.py imgs.json     # images.js を作り直す

  ・imgs.json は、18ホール分の {"map": 画像, "tee": 画像, "green": 画像} の並び
    （画像は data:image/… で始まる文字）。
  ・合言葉は、環境変数 IMG_PASS で渡します。ファイルには書きません（リポジトリに置かない決まり）。
  ・作り直したら、js/version.js の IMG_REV を1つ上げます（スマホが新しい画像を取りに行く合図）。
  ・作り直すと、スマホでは合言葉をもう一度入れる必要があります
    （同じ合言葉でも、作り直すたびに暗号の鍵が変わるため）。

暗号の方式（js/pics.js の開け方と対になっている）:
    合言葉 → PBKDF2（SHA-256・20万回）→ 256ビットの鍵 → AES-GCM で暗号化
"""
import base64
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def make(images_json, password):
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    with open(images_json, encoding="utf8") as f:
        data = json.load(f)
    assert isinstance(data, list) and len(data) == 18, "画像は18ホール分の並びにしてください"
    for i, d in enumerate(data):
        for k in ("map", "tee", "green"):
            assert str(d.get(k, "")).startswith("data:image/"), "%d番の %s が画像ではありません" % (i + 1, k)
    salt, iv = os.urandom(16), os.urandom(12)  # 毎回ちがう値にする（同じ合言葉でも、同じ暗号文にならない）
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=200000).derive(password.encode())
    plain = json.dumps(data, separators=(",", ":")).encode()
    secret = AESGCM(key).encrypt(iv, plain, None)
    b64 = lambda x: base64.b64encode(x).decode()
    return "const IMGX=" + json.dumps({"s": b64(salt), "i": b64(iv), "d": b64(secret)}, separators=(",", ":")) + ";\n"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    password = os.environ.get("IMG_PASS")
    if not args or not password:
        print(__doc__)
        print("※ 画像のファイル（imgs.json）と、環境変数 IMG_PASS の両方が必要です。")
        return 1
    out = args[1] if len(args) > 1 else os.path.join(ROOT, "images.js")
    text = make(args[0], password)
    with open(out, "w", encoding="utf8") as f:
        f.write(text)
    print("作りました: %s（%d KB）。js/version.js の IMG_REV を1つ上げてください。" % (out, len(text) // 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
