import csv
import json
import re
import time
from collections import defaultdict

import requests

API = "http://127.0.0.1:8000/api/compare-matrix/"
MODELS = ["openai/gpt-oss-20b", "gemini-3.1-flash-lite", "ministral-8b-latest", "ministral-14b-latest"]
TECHNIQUES = ["zero-shot", "one-shot", "few-shot", "chain-of-thought", "role-based"]
ROLE = "a careful math teacher"

# Added to every question so answers can be checked automatically. Same for all techniques.
SUFFIX = "\n\nEnd your reply with a final line in exactly this form: ANSWER: <number>"

EXAMPLES = [
    {"input": "5 apples cost 20 rupees. What is the cost of 15 apples, in rupees?" + SUFFIX, "output": "ANSWER: 60"},
    {"input": "A rectangle is 8 m long and 3 m wide. What is its area in square metres?" + SUFFIX, "output": "ANSWER: 24"},
]

QUESTIONS = [
    ("A bat and a ball cost 1.10 dollars in total. The bat costs 1.00 dollar more than the ball. How many cents does the ball cost?", 5),
    ("A patch of lily pads doubles in size every day. It takes 48 days to cover the whole lake. How many days does it take to cover half the lake?", 47),
    ("5 machines take 5 minutes to make 5 widgets. How many minutes would 100 machines take to make 100 widgets?", 5),
    ("A shop sells pens at 3 for 10 rupees. How much do 12 pens cost, in rupees?", 40),
    ("A train leaves Pune at 60 km/h. Another leaves Mumbai, 150 km away, at 90 km/h toward the first train at the same time. How far from Pune, in km, do they meet?", 60),
    ("A car drives 60 km at 30 km/h, then returns the same 60 km at 60 km/h. What is its average speed for the whole trip, in km/h?", 40),
    ("A farmer has 17 sheep. All but 9 run away. How many sheep are left?", 9),
    ("Ravi is twice as old as Sita. Ten years ago Ravi was three times as old as Sita. How old is Ravi now?", 40),
    ("An item costs 800 rupees. It gets a 25% discount, then 10% off the discounted price. What is the final price in rupees?", 540),
    ("A can finish a job in 12 days and B can finish it in 6 days. Working together, how many days do they need?", 4),
    ("How many two-digit numbers are divisible by 7?", 13),
    ("What is the sum of all even numbers from 1 to 50?", 650),
]


def extract(text):
    found = re.findall(r"ANSWER:\s*\**\s*[₹$]?\s*(-?[\d,]*\.?\d+)", text or "", re.I)
    return float(found[-1].replace(",", "")) if found else None


rows = []
for qi, (question, truth) in enumerate(QUESTIONS, 1):
    body = {
        "prompt": question + SUFFIX,
        "prompt_types": TECHNIQUES,
        "models": MODELS,
        "examples": EXAMPLES,
        "role": ROLE,
        "score": False,
    }
    try:
        resp = requests.post(API, json=body, timeout=300)
        resp.raise_for_status()
        matrix = resp.json()["matrix"]
    except Exception as e:
        print(f"Q{qi} failed: {e}")
        continue

    for row in matrix:
        for res in row["results"]:
            got = None
            if res["error"]:
                status, correct = "error", None
            else:
                got = extract(res["output_text"])
                if got is None:
                    status, correct = "no_answer", False
                else:
                    status, correct = "ok", abs(got - truth) < 1e-6
            rows.append({
                "question": qi, "technique": row["prompt_type"], "model": res["model_name"],
                "truth": truth, "got": got, "status": status, "correct": correct,
                "output_tokens": res["output_tokens"], "latency_ms": round(res["latency_ms"]),
                "output_text": res["output_text"],
            })
    print(f"Question {qi}/{len(QUESTIONS)} done")
    time.sleep(15)  # stay under free-tier rate limits


def table(title, keyfn):
    groups = defaultdict(list)
    for r in rows:
        groups[keyfn(r)].append(r)
    print(f"\n{title}")
    for k, rs in sorted(groups.items()):
        valid = [r for r in rs if r["status"] != "error"]
        ok = sum(1 for r in valid if r["correct"])
        no_ans = sum(1 for r in valid if r["status"] == "no_answer")
        toks = [r["output_tokens"] for r in valid if r["output_tokens"]]
        pct = 100 * ok / max(len(valid), 1)
        print(f"{k:<48} {ok}/{len(valid)} = {pct:.0f}%  no-answer {no_ans}  "
              f"avg tokens {sum(toks) / max(len(toks), 1):.0f}  API errors {len(rs) - len(valid)}")


table("BY TECHNIQUE", lambda r: r["technique"])
table("BY MODEL", lambda r: r["model"])
table("BY TECHNIQUE x MODEL", lambda r: f'{r["technique"]} | {r["model"]}')

with open("eval_results.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, indent=2, ensure_ascii=False)
with open("eval_results.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=[k for k in rows[0] if k != "output_text"])
    w.writeheader()
    for r in rows:
        w.writerow({k: v for k, v in r.items() if k != "output_text"})
print(f"\nSaved {len(rows)} runs to eval_results.json and eval_results.csv")