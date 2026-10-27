import json
import os
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

from rest_framework.test import APITestCase

from llm_adapters.groq_adapter import GroqAdapter


class ImprovePromptTests(APITestCase):
    @patch("comparisons.views.ADAPTERS")
    def test_returns_improved_prompt_and_reasons(self, adapters):
        adapters.__getitem__.return_value.call.return_value = SimpleNamespace(
            error=None,
            output_text=json.dumps({
                "improved_prompt": "Explain the water cycle in three steps.",
                "reasons": ["Specifies a clear action.", "Sets a concise format."],
            }),
        )

        response = self.client.post(
            "/api/improve-prompt/",
            {"prompt": "Tell me about the water cycle"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["improved_prompt"], "Explain the water cycle in three steps.")
        self.assertEqual(len(response.data["reasons"]), 2)
        call_args, call_kwargs = adapters.__getitem__.return_value.call.call_args
        self.assertEqual(call_args[1:3], ("openai/gpt-oss-20b", "prompt-refinement"))
        self.assertEqual(call_kwargs, {"temperature": 0.2, "max_tokens": 600})

    def test_rejects_empty_prompt(self):
        response = self.client.post(
            "/api/improve-prompt/",
            {"prompt": "  "},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    @patch("comparisons.views.ADAPTERS")
    def test_returns_provider_errors(self, adapters):
        adapters.__getitem__.return_value.call.return_value = SimpleNamespace(
            error="Groq API unavailable",
            output_text="",
        )

        response = self.client.post(
            "/api/improve-prompt/",
            {"prompt": "Explain the water cycle"},
            format="json",
        )

        self.assertEqual(response.status_code, 502)
        self.assertIn("Groq API unavailable", response.data["error"])


class GroqAdapterTests(TestCase):
    @patch.dict(os.environ, {"GROQ_API_KEY": "test-key"})
    @patch("llm_adapters.groq_adapter.post_with_retry")
    def test_sends_bearer_token_and_requested_model(self, post_with_retry):
        post_with_retry.return_value = SimpleNamespace(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "Improved prompt"}}],
                "usage": {},
            },
        )

        response = GroqAdapter().call("Refine this", "openai/gpt-oss-20b", "prompt-refinement")

        self.assertIsNone(response.error)
        self.assertEqual(response.output_text, "Improved prompt")
        self.assertEqual(
            post_with_retry.call_args.kwargs["headers"]["Authorization"],
            "Bearer test-key",
        )
        self.assertEqual(
            post_with_retry.call_args.kwargs["json"]["model"],
            "openai/gpt-oss-20b",
        )


class CompareContextTests(APITestCase):
    @patch("comparisons.views.score_many", return_value={})
    def test_appends_uploaded_context_to_model_prompt(self, _score_many):
        adapter = Mock()
        adapter.call.return_value = SimpleNamespace(
            model_name="openai/gpt-oss-20b",
            provider="groq",
            prompt_type="zero-shot",
            output_text="Answer",
            latency_ms=1,
            input_tokens=None,
            output_tokens=None,
            error=None,
        )
        with patch("comparisons.views.ADAPTERS", {"openai/gpt-oss-20b": adapter}):
            response = self.client.post(
                "/api/compare/",
                {
                    "prompt": "Summarize the document",
                    "models": ["openai/gpt-oss-20b"],
                    "context": "[Attached file: notes.txt]\nProject launch is on Friday.",
                },
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn("Project launch is on Friday.", adapter.call.call_args.args[0])
        self.assertFalse(response.data["context_truncated"])

    @patch("comparisons.views.score_many", return_value={})
    def test_truncates_excess_context_with_warning(self, _score_many):
        adapter = Mock()
        adapter.call.return_value = SimpleNamespace(
            model_name="openai/gpt-oss-20b",
            provider="groq",
            prompt_type="zero-shot",
            output_text="Answer",
            latency_ms=1,
            input_tokens=None,
            output_tokens=None,
            error=None,
        )
        with patch("comparisons.views.ADAPTERS", {"openai/gpt-oss-20b": adapter}):
            response = self.client.post(
                "/api/compare/",
                {
                    "prompt": "Summarize this",
                    "models": ["openai/gpt-oss-20b"],
                    "context": "x" * 110000,
                },
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["context_truncated"])
        self.assertLessEqual(len(adapter.call.call_args.args[0]), 120000)
