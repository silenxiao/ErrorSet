# 小程序 WXSS/WXML 结构快检：括号配平与 emoji 残留扫描。
import glob
import re
import os

os.chdir(os.path.join(os.path.dirname(__file__), "..", "miniprogram"))

bad = []
for f in glob.glob("pages/**/*.wxss", recursive=True) + glob.glob(
    "components/**/*.wxss", recursive=True
) + ["app.wxss"]:
    s = open(f, encoding="utf-8").read()
    if s.count("{") != s.count("}"):
        bad.append((f, s.count("{"), s.count("}")))
print("WXSS UNBALANCED:", bad if bad else "none")

pat = re.compile(
    "[\U0001F300-\U0001FAFF\u2600-\u26FF\u2700-\u27BF\u2B00-\u2BFF\u2304\u25BE\u203A\u270E\uFF0B]"
)
hits = []
for f in glob.glob("pages/**/*.wxml", recursive=True) + glob.glob(
    "components/**/*.wxml", recursive=True
):
    for i, line in enumerate(open(f, encoding="utf-8"), 1):
        if pat.search(line):
            hits.append(f"{f}:{i}")
print("EMOJI LEFT:", hits if hits else "none")
