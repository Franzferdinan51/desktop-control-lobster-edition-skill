#!/usr/bin/env python3
import base64
import io
import json
import sys
import time


def main():
    # Use sys.stdin.buffer.read() for reliable binary stdin on Windows (Node.js
    # spawns Python with a pipe that can return empty from sys.stdin.read()
    # but always works via sys.stdin.buffer). Safe on macOS/Linux too.
    stdin_data = sys.stdin.buffer.read() if hasattr(sys.stdin, 'buffer') else sys.stdin.read()
    request = json.loads(stdin_data or b"{}")
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
        requested = (args["x"], args["y"])
        pyautogui.moveTo(args["x"], args["y"], duration=args.get("duration", 0))
        result = {"ok": True, "requested": list(requested)}
        if args.get("verify"):
            actual = pyautogui.position()
            result["actual"] = [actual.x, actual.y]
            result["drift"] = [actual.x - requested[0], actual.y - requested[1]]
        print(json.dumps(result))
        return

    if action == "mouse_click":
        click_duration = args.get("duration", 0.05)
        if "x" in args and "y" in args:
            pyautogui.moveTo(args["x"], args["y"], duration=click_duration)
            pyautogui.click(button=args.get("button", "left"), clicks=args.get("clicks", 1))
        else:
            pyautogui.click(button=args.get("button", "left"), clicks=args.get("clicks", 1))
        result = {"ok": True}
        if args.get("verify"):
            actual = pyautogui.position()
            result["actual"] = [actual.x, actual.y]
        print(json.dumps(result))
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

    if action == "mouse_hover":
        pyautogui.moveTo(args["x"], args["y"], duration=args.get("duration", 0.1))
        print(json.dumps({"ok": True}))
        return

    if action == "right_click":
        if "x" in args and "y" in args:
            pyautogui.rightClick(args["x"], args["y"])
        else:
            pyautogui.rightClick()
        print(json.dumps({"ok": True}))
        return

    if action == "focus_window":
        try:
            import pygetwindow as gw
            title = args.get("title")
            if title:
                wins = gw.getWindowsWithTitle(title)
                if wins:
                    wins[0].activate()
                    wins[0].restore()
                    print(json.dumps({"ok": True, "found": True}))
                    return
            print(json.dumps({"ok": False, "found": False, "error": "window not found"}))
        except Exception as e:
            print(json.dumps({"error": str(e), "ok": False}))
        return

    if action == "middle_click":
        if "x" in args and "y" in args:
            pyautogui.middleClick(args["x"], args["y"])
        else:
            pyautogui.middleClick()
        print(json.dumps({"ok": True}))
        return

    if action == "wait_for_image":
        try:
            image_path = args.get("image_path")
            if not image_path:
                print(json.dumps({"error": "image_path required", "found": False}))
                return
            timeout = max(0.0, float(args.get("timeout", 10)))
            confidence = float(args.get("confidence", 0.9))
            start = time.monotonic()
            while time.monotonic() - start < timeout:
                try:
                    loc = pyautogui.locateOnScreen(image_path, confidence=confidence)
                    if loc:
                        center = pyautogui.center(loc)
                        print(json.dumps({"found": True, "x": center.x, "y": center.y}))
                        return
                except Exception:
                    pass
                time.sleep(0.5)
            print(json.dumps({"found": False}))
        except Exception as e:
            print(json.dumps({"error": str(e), "found": False}))
        return

    if action == "screenshot_window":
        try:
            import pygetwindow as gw
            title = args.get("title")
            if title:
                wins = gw.getWindowsWithTitle(title)
                if wins:
                    win = wins[0]
                    win.activate()
                    time.sleep(0.3)
                    region = (win.left, win.top, win.width, win.height)
                    image = pyautogui.screenshot(region=region)
                    output = io.BytesIO()
                    image.save(output, format="PNG")
                    print(json.dumps({"image": base64.b64encode(output.getvalue()).decode("ascii"), "region": list(region)}))
                    return
            print(json.dumps({"error": "window not found"}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
        return

    if action == "get_window_info":
        try:
            import pygetwindow as gw
            title = args.get("title")
            if title:
                wins = gw.getWindowsWithTitle(title)
                if wins:
                    win = wins[0]
                    print(json.dumps({
                        "found": True,
                        "title": win.title,
                        "left": win.left,
                        "top": win.top,
                        "width": win.width,
                        "height": win.height,
                        "isActive": win.isActive,
                        "isMinimized": win.isMinimized,
                        "isMaximized": win.isMaximized
                    }))
                    return
            print(json.dumps({"found": False}))
        except Exception as e:
            print(json.dumps({"error": str(e), "found": False}))
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
        else:
            print(json.dumps({"ok": False, "error": f"unknown scroll direction: {direction}"}))
            return
        print(json.dumps({"ok": True}))
        return

    if action == "wait":
        time.sleep(float(args.get("seconds", 1)))
        print(json.dumps({"ok": True}))
        return

    if action == "get_all_windows":
        try:
            import pygetwindow as gw
            import platform
            windows = []
            if platform.system() == 'Darwin':
                for title in gw.getAllTitles():
                    if title:
                        windows.append({"title": title, "left": None, "top": None, "width": None, "height": None, "isActive": False, "isMinimized": False, "isMaximized": False})
            else:
                for win in gw.getAllWindows():
                    if win.title:
                        windows.append({
                            "title": win.title,
                            "left": win.left,
                            "top": win.top,
                            "width": win.width,
                            "height": win.height,
                            "isActive": win.isActive,
                            "isMinimized": win.isMinimized,
                            "isMaximized": win.isMaximized
                        })
            print(json.dumps({"windows": windows}))
        except Exception as e:
            print(json.dumps({"error": str(e), "windows": []}))
        return

    if action in {"minimize_window", "maximize_window", "restore_window", "close_window", "move_window", "resize_window"}:
        try:
            import pygetwindow as gw
            title = args.get("title")
            wins = gw.getWindowsWithTitle(title) if title else []
            if not wins:
                print(json.dumps({"ok": False, "found": False, "error": "window not found"}))
                return
            win = wins[0]
            if action == "minimize_window":
                win.minimize()
            elif action == "maximize_window":
                win.maximize()
            elif action == "restore_window":
                win.restore()
            elif action == "close_window":
                win.close()
            elif action == "move_window":
                win.moveTo(args.get("x", 0), args.get("y", 0))
            elif action == "resize_window":
                win.resizeTo(args.get("width", 800), args.get("height", 600))
            print(json.dumps({"ok": True, "found": True}))
        except Exception as e:
            print(json.dumps({"error": str(e), "ok": False}))
        return

    if action == "get_monitors":
        try:
            import screeninfo
            monitors = []
            for m in screeninfo.get_monitors():
                monitors.append({
                    "x": m.x,
                    "y": m.y,
                    "width": m.width,
                    "height": m.height,
                    "is_primary": m.is_primary
                })
            print(json.dumps({"monitors": monitors}))
        except Exception:
            size = pyautogui.size()
            print(json.dumps({"monitors": [{"x": 0, "y": 0, "width": size.width, "height": size.height, "is_primary": True}]}))
        return

    if action == "list_processes":
        try:
            import psutil
            procs = []
            for p in psutil.process_iter(['pid', 'name', 'exe']):
                try:
                    procs.append(p.info)
                except Exception:
                    pass
            print(json.dumps({"processes": procs[:50]}))
        except Exception as e:
            print(json.dumps({"error": str(e), "processes": []}))
        return

    if action == "kill_process":
        try:
            import psutil
            pid = args.get("pid")
            if pid:
                p = psutil.Process(int(pid))
                p.terminate()
            print(json.dumps({"ok": True}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
        return

    raise SystemExit(f"unknown action: {action}")


if __name__ == "__main__":
    main()
