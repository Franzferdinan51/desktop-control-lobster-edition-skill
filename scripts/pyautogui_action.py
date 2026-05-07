#!/usr/bin/env python3
import base64
import io
import json
import sys


def main():
    request = json.loads(sys.stdin.read() or "{}")
    action = request.get("action")
    args = request.get("args", {})

    import pyautogui

    pyautogui.FAILSAFE = False
    pyautogui.PAUSE = 0

    if action == "screenshot":
        region = args.get("region")
        image = pyautogui.screenshot(region=tuple(region) if region else None)
        output = io.BytesIO()
        image.save(output, format="PNG")
        print(json.dumps({"image": base64.b64encode(output.getvalue()).decode("ascii")}))
        return

    if action == "mouse_move":
        pyautogui.moveTo(args["x"], args["y"], duration=args.get("duration", 0))
        print(json.dumps({"ok": True}))
        return

    if action == "mouse_click":
        if "x" in args and "y" in args:
            pyautogui.click(args["x"], args["y"], button=args.get("button", "left"), clicks=args.get("clicks", 1))
        else:
            pyautogui.click(button=args.get("button", "left"), clicks=args.get("clicks", 1))
        print(json.dumps({"ok": True}))
        return

    if action == "mouse_scroll":
        pyautogui.scroll(args.get("amount", -3))
        print(json.dumps({"ok": True}))
        return

    if action == "keyboard_type":
        pyautogui.write(args["text"], interval=args.get("interval", 0))
        print(json.dumps({"ok": True}))
        return

    if action == "keyboard_press":
        pyautogui.press(args["key"])
        print(json.dumps({"ok": True}))
        return

    if action == "keyboard_hotkey":
        pyautogui.hotkey(*args["keys"])
        print(json.dumps({"ok": True}))
        return

    if action == "cursor_position":
        pos = pyautogui.position()
        print(json.dumps({"x": pos.x, "y": pos.y}))
        return

    if action == "screen_size":
        size = pyautogui.size()
        print(json.dumps({"width": size.width, "height": size.height}))
        return

    if action == "pixel_color":
        image = pyautogui.screenshot(region=(args["x"], args["y"], 1, 1))
        r, g, b = image.getpixel((0, 0))[:3]
        print(json.dumps({"r": r, "g": g, "b": b}))
        return

    raise SystemExit(f"unknown action: {action}")


if __name__ == "__main__":
    main()
