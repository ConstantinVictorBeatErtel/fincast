from engine.fincast_engine.contracts import NodeContract
from engine.fincast_engine.llm import build_prompt, prompt_prefix_hash


def test_shared_prompt_prefix_is_identical_across_fanout():
    first = NodeContract.model_validate({"id": "research.gross_margin", "output": {"name": "gross_margin_pct"}})
    second = NodeContract.model_validate({"id": "research.opex", "output": {"name": "opex_pct"}})
    first_prompt = build_prompt(first, {"mdna": "same evidence"}, "ticker=AAPL\nretry=none")
    second_prompt = build_prompt(second, {"mdna": "same evidence"}, "ticker=MSFT\nretry=assertion failed")
    assert prompt_prefix_hash(first_prompt) == prompt_prefix_hash(second_prompt)
    assert "AAPL" not in first_prompt[0]["content"] + first_prompt[1]["content"]
    assert "MSFT" not in second_prompt[0]["content"] + second_prompt[1]["content"]
    assert first_prompt[2]["content"] != second_prompt[2]["content"]
    assert first_prompt[3]["content"] != second_prompt[3]["content"]

