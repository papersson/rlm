/**
 * Python bridge script for the REPL environment.
 * This script is embedded as a string and written to a temp file at runtime.
 * @module repl/bridge
 */

/**
 * The Python bridge script that runs in the subprocess.
 *
 * Features:
 * - Loads `context` variable at startup
 * - Implements `llm_query(prompt)` via IPC callback
 * - Captures stdout/stderr during execution
 * - Returns variable state after each execution
 * - Computes sha256 of context for integrity verification
 */
export const PYTHON_BRIDGE_SCRIPT = `#!/usr/bin/env python3
"""
RLM Python Bridge
Provides a REPL environment for LLM-generated code execution.
Communicates with Node.js via JSON over stdin/stdout.
"""

import sys
import json
import hashlib
import traceback
import time
import uuid
from io import StringIO
from typing import Any, Dict, Optional

# Global state
context: Optional[str] = None
context_hash: Optional[str] = None
pending_llm_queries: Dict[str, str] = {}
# Persistent execution namespace - variables persist across code executions
exec_namespace: Dict[str, Any] = {}
# Keep a reference to the real stdout for IPC (code execution captures stdout)
_real_stdout = sys.stdout
_real_stdin = sys.stdin

def send_message(msg: dict) -> None:
    """Send a JSON message to Node.js via stdout."""
    # Use _real_stdout to bypass any stdout capture during code execution
    _real_stdout.write(json.dumps(msg) + "\\n")
    _real_stdout.flush()

def read_message() -> dict:
    """Read a JSON message from Node.js via stdin."""
    # Use _real_stdin to ensure we read from the actual pipe
    line = _real_stdin.readline()
    if not line:
        raise EOFError("stdin closed")
    return json.loads(line.strip())

def llm_query(prompt: str) -> str:
    """
    Query the sub-LM through IPC callback.
    This function is available in the REPL for LLM-generated code.

    Args:
        prompt: The prompt to send to the sub-LM

    Returns:
        The sub-LM response as a string
    """
    request_id = str(uuid.uuid4())

    # Send query request to Node.js
    send_message({
        "type": "llm_query",
        "id": request_id,
        "query": prompt
    })

    # Wait for response
    while True:
        response = read_message()
        if response.get("type") == "llm_response" and response.get("id") == request_id:
            return response.get("response", "")
        # Handle other message types that might come through
        elif response.get("type") == "shutdown":
            sys.exit(0)

def get_serializable_variables(local_vars: dict, global_vars: dict) -> dict:
    """
    Extract serializable variables from the REPL state.
    Non-serializable objects are converted to type descriptions.
    """
    result = {}

    # Combine local and global vars, preferring local
    all_vars = {**global_vars, **local_vars}

    # Skip internal Python variables and modules
    skip_prefixes = ('__', '_')
    skip_names = {'llm_query', 'send_message', 'read_message',
                  'get_serializable_variables', 'execute_code',
                  'handle_init', 'handle_execute', 'handle_get_variables',
                  'handle_get_context_hash', 'main', 'pending_llm_queries',
                  'exec_namespace', 'context_hash'}

    for name, value in all_vars.items():
        # Skip internal vars
        if any(name.startswith(p) for p in skip_prefixes):
            continue
        if name in skip_names:
            continue
        # Skip modules and functions (except llm_query which we want to show)
        if hasattr(value, '__module__') and name != 'context':
            continue

        try:
            # Try to serialize
            json.dumps(value)
            result[name] = value
        except (TypeError, ValueError):
            # Not serializable, show type and length if available
            type_name = type(value).__name__
            if hasattr(value, '__len__'):
                result[name] = f"[{type_name} with {len(value)} items]"
            else:
                result[name] = f"[{type_name}]"

    return result

def execute_code(code: str) -> dict:
    """
    Execute Python code in the REPL environment.
    Variables persist across executions via exec_namespace.

    Args:
        code: Python code to execute

    Returns:
        Dict with output, error, variables, and execution time
    """
    global context, context_hash, exec_namespace

    start_time = time.time()

    # Capture stdout
    stdout_capture = StringIO()
    old_stdout = sys.stdout
    sys.stdout = stdout_capture

    error = None

    try:
        # Update namespace with current context and llm_query
        exec_namespace['context'] = context
        exec_namespace['context_hash'] = context_hash
        exec_namespace['llm_query'] = llm_query
        if '__builtins__' not in exec_namespace:
            exec_namespace['__builtins__'] = __builtins__

        # Execute the code - variables persist in exec_namespace
        exec(code, exec_namespace)

        # Update global context if it was modified
        if 'context' in exec_namespace and exec_namespace['context'] != context:
            context = exec_namespace['context']

    except Exception as e:
        error = f"{type(e).__name__}: {str(e)}\\n{traceback.format_exc()}"
    finally:
        sys.stdout = old_stdout

    execution_time = (time.time() - start_time) * 1000  # Convert to ms

    # Get serializable variables from the persistent namespace
    variables = get_serializable_variables(exec_namespace, {})

    return {
        "output": stdout_capture.getvalue(),
        "error": error,
        "variables": variables,
        "timeMs": execution_time
    }

def handle_init(msg: dict) -> None:
    """Handle initialization request."""
    global context, context_hash

    context = msg.get("context", "")
    context_hash = hashlib.sha256(context.encode()).hexdigest()

    send_message({
        "type": "init_complete",
        "contextHash": context_hash
    })

def handle_execute(msg: dict) -> None:
    """Handle code execution request."""
    code = msg.get("code", "")
    result = execute_code(code)

    send_message({
        "type": "result",
        "output": result["output"],
        "error": result["error"],
        "variables": result["variables"],
        "timeMs": result["timeMs"]
    })

def handle_get_variables() -> None:
    """Handle get variables request."""
    global exec_namespace
    # Ensure context is in namespace
    exec_namespace['context'] = context
    variables = get_serializable_variables(exec_namespace, {})

    send_message({
        "type": "variables",
        "data": variables
    })

def handle_get_context_hash() -> None:
    """Handle get context hash request."""
    # Recompute hash to verify integrity
    current_hash = hashlib.sha256(context.encode()).hexdigest() if context else ""

    send_message({
        "type": "context_hash",
        "hash": current_hash
    })

def main() -> None:
    """Main loop for the Python bridge."""
    global context, context_hash

    # Disable Python's stdout buffering
    sys.stdout.reconfigure(line_buffering=True)

    try:
        while True:
            msg = read_message()
            msg_type = msg.get("type")

            if msg_type == "init":
                handle_init(msg)
            elif msg_type == "execute":
                handle_execute(msg)
            elif msg_type == "get_variables":
                handle_get_variables()
            elif msg_type == "get_context_hash":
                handle_get_context_hash()
            elif msg_type == "shutdown":
                send_message({"type": "shutdown_complete"})
                break
            else:
                send_message({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}"
                })

    except EOFError:
        # stdin closed, exit gracefully
        pass
    except Exception as e:
        send_message({
            "type": "error",
            "message": f"Bridge error: {str(e)}\\n{traceback.format_exc()}"
        })
        sys.exit(1)

if __name__ == "__main__":
    main()
`;
