#!/usr/bin/env python3
"""
cua_action.py — wraps trycua/cua-driver (the Rust+Swift driver behind Hermes Agent's CUA mode).

Why: cua-driver runs the actual accessibility-API dispatch (AX on macOS, UIA on Windows,
AT-SPI2 on Linux), with a real Rust binary that holds the AX tree state, has stable
element_index handles, and dispatches input events via CGEventPostToPid (macOS) /
IUIAutomation (Windows). Calling pyautogui directly moves the user's cursor; cua-driver
does NOT — your cursor stays put, keyboard focus stays yours, and the agent can run
alongside you.

Install:
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"

This adds ~/.local/bin/cua-driver to PATH and /Applications/CuaDriver.app on macOS.
On first run you'll be prompted for Accessibility + Screen Recording permissions (macOS).

Wire into Newest Desktop Control:
    NEWEST_DC_CUA_DRIVER=~/.local/bin/cua-driver   # optional override

This script reads JSON from stdin: {"action": "...", "args": {...}} and writes JSON to stdout.
"""

import base64
import io
import json
import os
import subprocess
import sys
import unicodedata
import re


CUA_DRIVER = os.environ.get("NEWEST_DC_CUA_DRIVER") or os.path.expanduser("~/.local/bin/cua-driver")


def _is_control_char(c):
    return unicodedata.category(c).startswith("Cc")


def _normalize(s):
    if not s:
        return ""
    cleaned = "".join(c for c in unicodedata.normalize("NFKD", s) if not _is_control_char(c) and c != "\ufffd")
    return re.sub(r"\s+", " ", cleaned).strip()


def _driver_call(tool, args=None):
    payload = json.dumps(args or {})
    try:
        result = subprocess.run(
            [CUA_DRIVER, "call", tool, payload],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"cua-driver not found at {CUA_DRIVER}. "
            f"Install with: /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)\""
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"cua-driver {tool} timed out after 30s") from exc
    out = (result.stdout or "").strip()
    if not out:
        raise RuntimeError(f"cua-driver {tool} returned no output. stderr={result.stderr!r}")
    json_start = -1
    for i, line in enumerate(out.splitlines()):
        stripped = line.lstrip()
        if stripped.startswith("{") or stripped.startswith("["):
            json_start = i
            break
    if json_start == -1:
        if result.returncode != 0:
            raise RuntimeError(f"cua-driver {tool} failed ({result.returncode}): {result.stderr or out}")
        return {"_text": out, "_ok": True}
    cleaned = "\n".join(out.splitlines()[json_start:])
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"cua-driver {tool} returned non-JSON: {cleaned[:200]}") from exc
    if result.returncode != 0:
        raise RuntimeError(f"cua-driver {tool} failed ({result.returncode}): {parsed}")
    return parsed


def action_screenshot(args, computer):
    import platform
    if platform.system() == "Darwin":
        cmd = ["screencapture", "-x", "-t", "png", "-"]
        proc = subprocess.run(cmd, capture_output=True, timeout=10)
        if proc.returncode != 0:
            raise RuntimeError(f"screencapture failed: {proc.stderr.decode('utf-8', 'ignore')}")
        return {
            "image": base64.b64encode(proc.stdout).decode("ascii"),
            "width": 0,
            "height": 0,
            "source": "screencapture",
        }
    raise RuntimeError(f"screenshot not implemented for {platform.system()}")


def action_screenshot_window(args, computer):
    pid = int(args.get("pid", 0))
    if not pid:
        raise RuntimeError("screenshot_window requires pid")
    state = _driver_call("get_window_state", {"pid": pid, "capture_mode": "vision"})
    img_b64 = state.get("screenshot_base64") or state.get("screenshot")
    return {"image": img_b64, "pid": pid, "title": state.get("title"), "source": "cua-driver"}


def _resolve_window_id(pid, prefer_on_screen=True):
    wins = _driver_call("list_windows", {"pid": int(pid), "on_screen_only": prefer_on_screen}).get("windows", [])
    if not wins:
        return None
    def _score(w):
        return (
            1 if w.get("is_on_screen") else 0,
            1 if w.get("on_current_space") else 0,
            int(w.get("z_index") or 0),
            int(w.get("bounds", {}).get("width", 0)) * int(w.get("bounds", {}).get("height", 0)),
        )
    wins.sort(key=_score, reverse=True)
    return int(wins[0]["window_id"]) if wins else None


def action_ax_tree(args, computer):
    apps = _driver_call("list_apps", {})
    out = {
        "apps": [
            {
                "name": _normalize(a.get("name")),
                "bundle_id": a.get("bundle_id"),
                "pid": int(a.get("pid") or 0),
                "running": bool(a.get("running")),
                "active": bool(a.get("active")),
            }
            for a in apps.get("apps", [])
        ],
        "count": len(apps.get("apps", [])),
    }
    pid = args.get("pid")
    if pid:
        window_id = args.get("window_id")
        if not window_id:
            window_id = _resolve_window_id(pid)
        if not window_id:
            raise RuntimeError(f"No windows found for pid {pid}")
        snap = _driver_call("get_window_state", {
            "pid": int(pid),
            "window_id": int(window_id),
            "capture_mode": "ax",
            "max_elements": int(args.get("max_elements", 500)),
            "max_depth": int(args.get("max_depth", 12)),
        })
        out["window"] = {
            "pid": int(pid),
            "window_id": int(window_id),
            "title": _normalize(snap.get("title")),
            "elements": snap.get("elements", []),
            "tree_markdown": snap.get("tree_markdown"),
        }
    return out


def action_list_apps(args, computer):
    apps = _driver_call("list_apps", {})
    return {
        "apps": [
            {
                "name": _normalize(a.get("name")),
                "bundle_id": a.get("bundle_id"),
                "pid": int(a.get("pid") or 0),
                "running": bool(a.get("running")),
                "active": bool(a.get("active")),
            }
            for a in apps.get("apps", [])
        ],
        "count": len(apps.get("apps", [])),
    }


def action_focus_app(args, computer):
    pid = int(args.get("pid", 0))
    name = args.get("name", "")
    if not pid and not name:
        raise RuntimeError("focus_app requires pid or name")
    if not pid:
        apps = _driver_call("list_apps", {}).get("apps", [])
        for a in apps:
            if a.get("name") == name:
                pid = int(a.get("pid") or 0)
                break
    if not pid:
        raise RuntimeError(f"App not found: name={name!r}")
    _driver_call("bring_to_front", {"pid": pid})
    return {"focused_pid": pid}


def action_click_element(args, computer):
    pid = int(args.get("pid", 0))
    if not pid:
        raise RuntimeError("click_element requires pid")
    window_id = args.get("window_id") or _resolve_window_id(pid)
    element_index = args.get("element_index")
    button = args.get("button", "left")
    if element_index is not None:
        out = _driver_call("click", {
            "pid": pid,
            "window_id": int(window_id) if window_id else None,
            "element_index": int(element_index),
            "button": button,
            "action": args.get("action", "press"),
        })
        return {"clicked": element_index, "via": "element_index", "result": out}
    if "x" in args and "y" in args:
        out = _driver_call("click", {
            "pid": pid,
            "window_id": int(window_id) if window_id else None,
            "x": int(args["x"]),
            "y": int(args["y"]),
            "button": button,
        })
        return {"clicked_xy": [args["x"], args["y"]], "via": "pixel", "result": out}
    raise RuntimeError("click_element needs element_index or x+y")


def action_drag_element(args, computer):
    pid = int(args.get("pid", 0))
    if not pid:
        raise RuntimeError("drag_element requires pid")
    window_id = args.get("window_id") or _resolve_window_id(pid)
    from_index = args.get("from_index")
    to_index = args.get("to_index")
    out = _driver_call("drag", {
        "pid": pid,
        "window_id": int(window_id) if window_id else None,
        "from_index": int(from_index) if from_index is not None else None,
        "to_index": int(to_index) if to_index is not None else None,
        "from_x": args.get("from_x"),
        "from_y": args.get("from_y"),
        "to_x": args.get("to_x"),
        "to_y": args.get("to_y"),
    })
    return {"dragged": (from_index, to_index), "result": out}


def action_type_into(args, computer):
    pid = int(args.get("pid", 0))
    text = args.get("text", "")
    if not pid or not text:
        raise RuntimeError("type_into requires pid and text")
    window_id = args.get("window_id") or _resolve_window_id(pid)
    out = _driver_call("type_text", {
        "pid": pid,
        "window_id": int(window_id) if window_id else None,
        "element_index": int(args["element_index"]) if args.get("element_index") is not None else None,
        "text": text,
    })
    return {"typed": len(text), "result": out}


def action_key_combo(args, computer):
    keys = args.get("keys") or []
    if not keys:
        raise RuntimeError("key_combo requires keys (list of key names)")
    pid = args.get("pid")
    if not pid:
        apps = _driver_call("list_apps", {}).get("apps", [])
        active = next((a for a in apps if a.get("active")), None)
        if active:
            pid = int(active.get("pid") or 0)
    if not pid:
        raise RuntimeError("key_combo needs pid or an active app to target")
    window_id = args.get("window_id") or _resolve_window_id(int(pid))
    out = _driver_call("hotkey", {
        "keys": keys,
        "pid": int(pid),
        "window_id": int(window_id) if window_id else None,
    })
    return {"pressed": keys, "result": out}


def action_som_capture(args, computer):
    pid = int(args.get("pid", 0))
    if not pid:
        raise RuntimeError("som_capture requires pid")
    window_id = args.get("window_id")
    if not window_id:
        window_id = _resolve_window_id(pid)
    if not window_id:
        raise RuntimeError(f"No windows found for pid {pid}")
    state = _driver_call("get_window_state", {
        "pid": pid,
        "window_id": int(window_id),
        "capture_mode": "som",
        "max_elements": int(args.get("max_elements", 800)),
        "max_depth": int(args.get("max_depth", 15)),
    })
    return {
        "image": state.get("screenshot_base64") or state.get("screenshot"),
        "title": state.get("title"),
        "elements": state.get("elements", []),
        "tree_markdown": state.get("tree_markdown"),
        "count": len(state.get("elements", [])),
        "window_id": int(window_id),
    }


def action_cursor_position(args, computer):
    return _driver_call("get_cursor_position", {})


def action_screen_size(args, computer):
    return _driver_call("get_screen_size", {})


def action_get_active_window(args, computer):
    out = _driver_call("list_apps", {})
    active = next((a for a in out.get("apps", []) if a.get("active")), None)
    if not active:
        return {"window": None}
    return {
        "window": {
            "title": _normalize(active.get("name")),
            "pid": int(active.get("pid") or 0),
            "bundle_id": active.get("bundle_id"),
        }
    }


def action_launch_app(args, computer):
    name = args.get("name") or args.get("bundle_id")
    if not name:
        raise RuntimeError("launch_app requires name or bundle_id")
    out = _driver_call("launch_app", {"name": name, "background": True})
    return {"launched": name, "result": out}


ACTIONS = {
    "screenshot": action_screenshot,
    "screenshot_window": action_screenshot_window,
    "ax_tree": action_ax_tree,
    "list_apps": action_list_apps,
    "focus_app": action_focus_app,
    "launch_app": action_launch_app,
    "som_capture": action_som_capture,
    "click_element": action_click_element,
    "drag_element": action_drag_element,
    "type_into": action_type_into,
    "key_combo": action_key_combo,
    "cursor_position": action_cursor_position,
    "screen_size": action_screen_size,
    "get_active_window": action_get_active_window,
}


def main():
    request = json.loads(sys.stdin.read() or "{}")
    action = request.get("action")
    args = request.get("args") or {}
    if action not in ACTIONS:
        raise SystemExit(f"unknown action: {action!r}. Known: {sorted(ACTIONS)}")
    result = ACTIONS[action](args, None)
    print(json.dumps(result, default=str))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stderr.write(f"cua_action error: {exc}\n")
        print(json.dumps({"error": str(exc), "type": type(exc).__name__}))
        sys.exit(1)
