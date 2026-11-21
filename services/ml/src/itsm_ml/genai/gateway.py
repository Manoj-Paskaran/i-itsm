import asyncio
import hashlib
import logging
import re
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Sequence
from typing import TypeVar, cast

from pydantic import BaseModel

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


def retry_delay_seconds(exc: Exception, retry: int, backoff: float) -> float:
    details = getattr(exc, "details", None)
    if isinstance(details, dict):
        error = details.get("error", details)
        entries = error.get("details", []) if isinstance(error, dict) else []
        if isinstance(entries, list):
            for entry in entries:
                if isinstance(entry, dict) and str(entry.get("@type", "")).endswith(
                    "google.rpc.RetryInfo"
                ):
                    delay = entry.get("retryDelay")
                    if isinstance(delay, str) and re.fullmatch(r"\d+(?:\.\d+)?s", delay):
                        return float(delay[:-1])
    return backoff * float(2**retry)


class ResilientGateway:
    def __init__(
        self, timeout: float = 20, retries: int = 2, backoff: float = 0.25, cache_size: int = 128
    ) -> None:
        self.timeout = timeout
        self.retries = retries
        self.backoff = backoff
        self.cache_size = cache_size
        self.cache: OrderedDict[str, BaseModel] = OrderedDict()

    async def execute(
        self,
        kind: str,
        request: BaseModel,
        primaries: Sequence[Callable[[], Awaitable[T]]],
        fallback: Callable[[], Awaitable[T]],
        *,
        cache: bool = True,
    ) -> T:
        key = (
            kind + hashlib.sha256(request.model_dump_json(by_alias=True).encode()).hexdigest()
            if cache
            else None
        )
        if key is not None and key in self.cache:
            self.cache.move_to_end(key)
            return cast(T, self.cache[key].model_copy(deep=True))

        loop = asyncio.get_running_loop()
        deadline = loop.time() + self.timeout
        response: T | None = None
        for index, primary in enumerate(primaries):
            defaults = getattr(primary, "__defaults__", None) or ()
            model = (
                getattr(defaults[0], "model", f"primary {index + 1}")
                if defaults
                else f"primary {index + 1}"
            )
            # Each model gets an equal share of what is left, so a model that is
            # down (503) cannot use up the budget before the fallback model runs.
            model_deadline = loop.time() + (deadline - loop.time()) / (len(primaries) - index)
            for retry in range(self.retries + 1):
                remaining = model_deadline - loop.time()
                if remaining <= 0:
                    break
                try:
                    response = await asyncio.wait_for(primary(), timeout=remaining)
                    logger.info("Gemini model %s answered %s", model, kind)
                    break
                except Exception as exc:
                    code = (
                        getattr(exc, "code", None)
                        or getattr(exc, "status_code", None)
                        or getattr(getattr(exc, "response", None), "status_code", None)
                    )
                    expected = code in (429, 503) or isinstance(exc, TimeoutError)
                    logger.warning(
                        "Gemini model %s failed for %s: %s", model, kind, exc, exc_info=not expected
                    )
                    if code not in (429, 503) or retry == self.retries:
                        break
                    delay = retry_delay_seconds(exc, retry, self.backoff)
                    if delay >= model_deadline - loop.time():
                        break
                    await asyncio.sleep(delay)
            if response is not None:
                break
        if response is None:
            response = await fallback()
            if primaries:
                return response
        if key is None:
            return response
        self.cache[key] = response.model_copy(deep=True)
        self.cache.move_to_end(key)
        while len(self.cache) > self.cache_size:
            self.cache.popitem(last=False)
        return response
