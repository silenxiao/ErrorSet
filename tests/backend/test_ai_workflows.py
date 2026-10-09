"""AI 路由、结构修复、输入一致性与识图探测回归。全部使用模拟 Provider。"""
import json

import pytest
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.agents.teacher_agent import TeacherAgent, TeacherAgentError
from app.core.config import get_settings
from app.core.exceptions import ValidationError, ProviderError, InvalidStateError
from app.database import repository as repo
from app.database.database import Base
from app.database.models import User, Question, Illustration, ModelProfile
from app.pipeline.global_recognition import recognize_global
from app.pipeline.local_recognition import recognize_local
from app.pipeline.merger import merge
from app.pipeline.validator import normalize_global
from app.providers.base import VisionResponse
from app.providers.factory import ProviderFactory
from app.providers.gemini import GeminiProvider
from app.providers.openai_compatible import OpenAICompatibleProvider
from app.schemas.teacher import TeacherAnswer, TeacherQuestion
from app.schemas.media import question_out
from app.services import question_service, settings_service

ANSWER = dict(subject="数学", answer="12", analysis="7 加 5 等于 12。", knowledge_points=["加法"], out_of_scope=False, confidence="high")
GLOBAL = {"questions": [{"question_no":"1", "text":"计算 7 + 5 的结果。", "subject":"数学", "bbox":[0,0,900,500], "confidence":0.9, "illustrations":[]}]}

class FakeProvider:
    def __init__(self, outputs):
        self.outputs = iter(outputs)
        self.requests = []
    async def analyze(self, request):
        # 请求会被后续修复修改，记录副本供断言。
        from dataclasses import replace
        self.requests.append(replace(request))
        output = next(self.outputs)
        return VisionResponse(output, "fake", "fake", 7)

@pytest.fixture(autouse=True)
def retry_limit(monkeypatch):
    monkeypatch.setattr(get_settings(), "json_max_retries", 1)

@pytest.mark.parametrize("base", [None, "https://generativelanguage.googleapis.com/v1beta", "https://example.com/v1beta/"])
def test_gemini_uses_native_protocol(base):
    provider = ProviderFactory.create("gemini", "test-model", "dummy", base)
    assert isinstance(provider, GeminiProvider)
    assert provider.endpoint.endswith("/models/test-model:generateContent")
    custom = ProviderFactory.create("custom", "test-model", "dummy", "https://example.com/v1")
    assert isinstance(custom, OpenAICompatibleProvider)

@pytest.mark.parametrize("local", [{"question_no":"2", "text":"别的题目"}, {"question_no":"1", "text":{"bad":"value"}}])
def test_wrong_local_never_overwrites(local):
    result = merge("原题", "1", local)
    assert result.text == "原题"
    assert not result.used_local

def test_local_missing_number_can_correct_text():
    assert merge("原题", "1", {"question_no":None, "text":"修正题干"}).used_local

@pytest.mark.parametrize("raw", [{"questions":[None, 1]}, {"questions":[{"text":" "}]}, {"questions":[{**GLOBAL["questions"][0], "illustrations":[{}]}]}, {"questions":[{**GLOBAL["questions"][0], "confidence":float("inf")}]}])
def test_invalid_global_rejected(raw):
    with pytest.raises(ValidationError):
        normalize_global(raw)

@pytest.mark.parametrize("fields", [{"answer":" "}, {"analysis":" "}, {"subject":"未知"}, {"confidence":None}, {"out_of_scope":"false"}])
def test_teacher_rejects_invalid_fields(fields):
    from pydantic import ValidationError as PydanticError
    with pytest.raises(PydanticError):
        TeacherAnswer.model_validate({**ANSWER, **fields})

def test_teacher_requires_confidence():
    data = {key:value for key,value in ANSWER.items() if key != "confidence"}
    with pytest.raises(TeacherAgentError):
        TeacherAgent._parse_response(json.dumps(data))

@pytest.mark.asyncio
async def test_global_repairs_semantically_invalid_output():
    provider = FakeProvider([json.dumps({"questions":[None]}), json.dumps(GLOBAL)])
    assert await recognize_global(provider, "dummy.png") == GLOBAL
    assert "上次输出未通过校验" in provider.requests[1].prompt
    assert provider.requests[0].system_prompt

@pytest.mark.asyncio
async def test_local_repairs_invalid_field_types():
    provider = FakeProvider(['{"question_no":"1","text":{}}', '{"question_no":"1","text":"修正"}'])
    assert (await recognize_local(provider, "dummy.png"))["text"] == "修正"
    assert "上次输出未通过校验" in provider.requests[1].prompt

@pytest.mark.asyncio
async def test_teacher_repairs_missing_fields_then_stops_at_budget():
    provider = FakeProvider(['{"answer":"12"}', json.dumps(ANSWER)])
    question = TeacherQuestion(text="计算", grade="一年级", image_path="dummy.png")
    assert (await TeacherAgent(provider).answer(question)).answer == "12"
    assert "confidence" in provider.requests[1].task_prompt
    failing = FakeProvider(['{}', '{}'])
    with pytest.raises(TeacherAgentError):
        await TeacherAgent(failing).answer(question)
    assert len(failing.requests) == 2

@pytest.mark.asyncio
async def test_global_stops_at_retry_budget():
    provider = FakeProvider(['{}', '{}'])
    with pytest.raises(ProviderError):
        await recognize_global(provider, "dummy.png")
    assert len(provider.requests) == 2

@pytest.fixture
def db_case(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'ai.db'}", connect_args={"check_same_thread":False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory() as db:
        user = User(username="tester", password_hash="unused")
        db.add(user); db.commit()
        path = tmp_path / "image.png"
        Image.new("RGB", (200,200), "white").save(path)
        exam = repo.create_exam(db, user_id=user.id, name="AI test", original_image=str(path))
        q = Question(exam_id=exam.id, question_no="1", text="计算 7+5", subject="数学", bbox=[0,0,800,800], ai_bbox=[0,0,800,800], last_analysis=ANSWER.copy())
        db.add(q); db.commit()
        ill = Illustration(question_id=q.id, bbox=[100,100,400,400], ai_bbox=[100,100,400,400])
        db.add(ill); db.commit()
        yield db, factory, user, q, ill
    engine.dispose()

@pytest.mark.parametrize("operation", ["text", "local_text", "illustration", "reset_illustration"])
def test_edit_invalidates_analysis(db_case, operation):
    db, _, _, q, ill = db_case
    if operation == "text": repo.update_question(db, q, text="新题干")
    elif operation == "local_text": repo.set_question_text(db, q, "新题干")
    elif operation == "illustration": repo.update_illustration_bbox(db, ill, [100,100,500,500])
    else:
        ill.bbox = [100,100,500,500]; db.commit()
        repo.reset_illustration_bbox(db, ill)
    db.refresh(q)
    assert q.last_analysis is None

@pytest.mark.asyncio
@pytest.mark.parametrize("edit", [False, True])
async def test_analysis_checks_live_input_and_cleans_temp(db_case, monkeypatch, edit):
    db, factory, user, q, _ = db_case
    temporary = []
    class EditingProvider:
        async def analyze(self, request):
            temporary.append(request.image_path)
            if edit:
                with factory() as other:
                    row = other.get(Question, q.id)
                    repo.update_question(other, row, text="编辑后的题目")
            return VisionResponse(json.dumps(ANSWER), "fake", "fake", 1)
    monkeypatch.setattr(settings_service, "get_recognition_provider", lambda *a,**k: EditingProvider())
    if edit:
        with pytest.raises(InvalidStateError):
            await question_service.analyze_question(db, q.id, user.id)
        db.rollback(); db.refresh(q)
        assert q.text == "编辑后的题目" and q.last_analysis is None
    else:
        result = await question_service.analyze_question(db, q.id, user.id)
        assert result.answer == "12"
        assert q.last_analysis["_input_fingerprint"]
        q.exam.grade = "二年级"; db.commit()
        assert question_out(q, user.id).last_analysis is None
    from pathlib import Path
    assert temporary and all(not Path(path).exists() for path in temporary)

@pytest.mark.asyncio
@pytest.mark.parametrize("output, ok", [('OK', False), ('{"expression":"7+5=?","answer":13}', False), ('{"expression":"7+5=?","answer":12}', True)])
async def test_model_probe_validates_image_expression_and_answer(monkeypatch, output, ok):
    provider = FakeProvider([output])
    monkeypatch.setattr(settings_service, "_build_provider", lambda *a,**k: provider)
    result = await settings_service.test_model_profile(ModelProfile(provider="fake", model="fake", api_key="fake"))
    assert result["ok"] is ok
    assert "7+5" not in provider.requests[0].prompt
