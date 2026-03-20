"""
AgentStack Auto-Instrumentation

Provides automatic tracing for popular LLM libraries.
Import and call the instrument function to enable auto-tracing.
"""

from typing import List, Optional


def instrument(libraries: Optional[List[str]] = None) -> List[str]:
    """
    Enable auto-instrumentation for specified libraries.

    If no libraries are specified, attempts to instrument all
    available libraries.

    Args:
        libraries: List of library names to instrument.
                   Supported: "openai", "anthropic", "crewai",
                   "langgraph", "langchain".

    Returns:
        List of successfully instrumented library names.
    """
    supported = {
        "openai": _instrument_openai,
        "anthropic": _instrument_anthropic,
        "crewai": _instrument_crewai,
        "langgraph": _instrument_langgraph,
        "langchain": _instrument_langchain,
    }

    if libraries is None:
        libraries = list(supported.keys())

    instrumented: List[str] = []
    for lib in libraries:
        if lib not in supported:
            continue
        try:
            supported[lib]()
            instrumented.append(lib)
        except ImportError:
            pass  # Library not installed, skip
        except Exception:
            pass  # Instrumentation failed, skip

    return instrumented


def _instrument_openai() -> None:
    """Instrument the OpenAI library."""
    from agentstack.instruments.openai import instrument as _inst
    _inst()


def _instrument_anthropic() -> None:
    """Instrument the Anthropic library."""
    from agentstack.instruments.anthropic import instrument as _inst
    _inst()


def _instrument_crewai() -> None:
    """Instrument the CrewAI library."""
    from agentstack.instruments.crewai import instrument as _inst
    _inst()


def _instrument_langgraph() -> None:
    """Instrument the LangGraph library."""
    from agentstack.instruments.langgraph import instrument as _inst
    _inst()


def _instrument_langchain() -> None:
    """Instrument the LangChain library."""
    from agentstack.instruments.langchain import instrument as _inst
    _inst()
