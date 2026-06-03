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

    if action == "mouse_drag":
        pyautogui.dragTo(args["x"], args["y"], duration=args.get("duration", 0.5), button=args.get("button", "left"))
        print(json.dumps({"ok": True}))
        return

    if action == "ocr":
        try:
            import pytesseract
            from PIL import Image
            region = args.get("region")
            lang = args.get("language", "eng")
            image = pyautogui.screenshot(region=tuple(region) if region else None)
            text = pytesseract.image_to_string(image, lang=lang)
            print(json.dumps({"text": text.strip()}))
        except Exception as e:
            print(json.dumps({"error": str(e), "text": ""}))
        return

    if action == "mouse_double_click":
        if "x" in args and "y" in args:
            pyautogui.doubleClick(args["x"], args["y"], button=args.get("button", "left"))
        else:
            pyautogui.doubleClick(button=args.get("button", "left"))
        print(json.dumps({"ok": True}))
        return

    if action == "key_down":
        pyautogui.keyDown(args["key"])
        print(json.dumps({"ok": True}))
        return

    if action == "key_up":
        pyautogui.keyUp(args["key"])
        print(json.dumps({"ok": True}))
        return

    if action == "get_active_window":
        try:
            import pygetwindow as gw
            win = gw.getActiveWindow()
            if win:
                print(json.dumps({"title": win.title, "left": win.left, "top": win.top, "width": win.width, "height": win.height}))
            else:
                print(json.dumps({"title": None}))
        except Exception:
            # Fallback: no pygetwindow
            print(json.dumps({"title": None, "note": "pygetwindow not installed"}))
        return

    if action == "find_image":
        try:
            image_path = args.get("image_path")
            if not image_path:
                print(json.dumps({"error": "image_path required"}))
                return
            confidence = float(args.get("confidence", 0.9))
            location = pyautogui.locateOnScreen(image_path, confidence=confidence)
            if location:
                center = pyautogui.center(location)
                print(json.dumps({
                    "found": True,
                    "x": center.x,
                    "y": center.y,
                    "left": location.left,
                    "top": location.top,
                    "width": location.width,
                    "height": location.height
                }))
            else:
                print(json.dumps({"found": False}))
        except Exception as e:
            print(json.dumps({"error": str(e), "found": False}))
        return

    if action == "scroll_direction":
        direction = args.get("direction", "down")
        amount = args.get("amount", 3)
        if direction == "up":
            pyautogui.scroll(amount)
        elif direction == "down":
            pyautogui.scroll(-amount)
        elif direction == "left":
            pyautogui.hscroll(-amount)
        elif direction == "right":
            pyautogui.hscroll(amount)
        print(json.dumps({"ok": True}))
        return

    raise SystemExit(f"unknown action: {action}")


if __name__ == "__main__":
    main()
