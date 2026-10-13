"""Execute a generated timed team module against a virtual clock and input task."""

import json
import sys
import types


class Clock:
    now = 0.0

    def perf_counter(self):
        return self.now

    def sleep(self, duration):
        self.now += max(0.0, duration)


clock = Clock()
fake_time = types.ModuleType("time")
fake_time.perf_counter = clock.perf_counter
fake_time.sleep = clock.sleep
sys.modules["time"] = fake_time


class BaseChar:
    def __init__(self, task, index):
        self.task = task
        self.index = index
        self.is_current_char = index == 0
        self.logger = types.SimpleNamespace(warning=lambda message: task.warnings.append(message))

    def get_resonance_key(self):
        return "e"

    def get_echo_key(self):
        return "q"

    def get_liberation_key(self):
        return "r"

    def resonance_available(self):
        return self.task.resonance_ready


src = types.ModuleType("src")
src.__path__ = []
char = types.ModuleType("src.char")
char.__path__ = []
sys.modules.update({"src": src, "src.char": char})
for class_name in ("Augusta", "Iuno", "ShoreKeeper"):
    module = types.ModuleType(f"src.char.{class_name}")
    setattr(module, class_name, type(class_name, (BaseChar,), {}))
    sys.modules[module.__name__] = module


class Task:
    combat_start = 1
    key_config = {"Tool Key": "t", "Dodge Key": "shift", "Jump Key": "space"}

    def __init__(self):
        self.events = []
        self.warnings = []
        self.active_index = 0
        self.chars = []
        self.resonance_ready = True
        self.target_locked = True
        self.fail_on_key = None
        self.switch_failures_remaining = 0
        self.switch_visible_at = 0.0
        self.switch_hide_after_key_until = 0.0
        self.stall_on_key = None
        self.keep_target_unlocked = False

    def record(self, action, key):
        self.events.append((round(clock.now * 1000), action, key))

    def sleep(self, duration):
        clock.sleep(duration)

    def send_key_down(self, key):
        self.record("down", key)
        if key == self.stall_on_key:
            self.stall_on_key = None
            clock.sleep(1.0)
        if key == self.fail_on_key:
            raise RuntimeError("injected input failure")

    def send_key_up(self, key):
        self.record("up", key)
        if key in ("1", "2", "3"):
            if self.switch_hide_after_key_until:
                self.switch_visible_at = self.switch_hide_after_key_until
                self.switch_hide_after_key_until = 0.0
            if self.switch_failures_remaining:
                self.switch_failures_remaining -= 1
            else:
                self.active_index = int(key) - 1

    def mouse_down(self, key="left"):
        self.record("down", key)

    def mouse_up(self, key="left"):
        self.record("up", key)

    def next_frame(self):
        pass

    def in_team(self):
        if clock.now < self.switch_visible_at:
            return False, self.active_index, 3
        return True, self.active_index, 3

    def raise_not_in_combat(self, message):
        raise RuntimeError(message)

    def wait_until(self, condition, time_out=0, post_action=None, raise_if_not_found=False):
        if condition():
            return True
        clock.sleep(min(time_out, 0.1))
        self.resonance_ready = True
        if not self.keep_target_unlocked:
            self.target_locked = True
        return bool(condition())

    def has_target(self):
        return self.target_locked


payload = json.load(sys.stdin)
mode = payload.get("mode") if isinstance(payload, dict) and "files" in payload else None
manual_check = mode == "manual"
delay_mode = mode == "delay"
post_check = mode == "post"
sources = payload["files"] if mode else payload
task = Task()
if manual_check:
    task.resonance_ready = False
if post_check:
    task.target_locked = False
if mode == "branch_post":
    task.target_locked = False
    task.keep_target_unlocked = True
if mode == "branch":
    task.resonance_ready = False
if mode in ("switch_retry", "switch_abort", "switch_exhaust"):
    task.switch_failures_remaining = 1 if mode != "switch_exhaust" else 10
if mode == "slow_input":
    task.stall_on_key = "r"
characters = {}
for index, class_name in enumerate(("Augusta", "Iuno", "ShoreKeeper")):
    namespace = {"__name__": f"generated_{class_name}"}
    exec(compile(sources[f"{class_name}.py"], f"{class_name}.py", "exec"), namespace)
    characters[class_name] = namespace[class_name](task, index)
task.chars = list(characters.values())

if mode in ("branch", "branch_post"):
    characters["Augusta"].do_perform()
    assert task._wwcombo_timed_startup_done
    if mode == "branch":
        assert (727, "down", "e") not in task.events, task.events
        assert (750, "down", "shift") in task.events, task.events
    else:
        assert (875, "up", "shift") in task.events, task.events
        assert (1200, "down", "3") in task.events, task.events
        assert (900, "down", "q") not in task.events, task.events
    print(f"OKWW {mode} route passed")
    sys.exit(0)

if mode == "long_sample":
    for _ in range(100):
        task.chars[task.active_index].do_perform()
        if task._wwcombo_timed_startup_done:
            break
    assert task._wwcombo_timed_startup_done, (clock.now, len(task.events))
    assert not task._wwcombo_timed_running and not task._wwcombo_timed_aborted
    assert not any("input late" in message for message in task.warnings), task.warnings
    print(f"OKWW full sample passed: {len(task.events)} emitted events, {clock.now:.3f}s virtual time")
    sys.exit(0)

if mode in ("wrong_start", "wrong_roster"):
    if mode == "wrong_start":
        task.active_index = 1
    else:
        task.chars[0], task.chars[1] = task.chars[1], task.chars[0]
    try:
        characters["Augusta"].do_perform()
    except RuntimeError as error:
        assert ("start with slot 1 active" if mode == "wrong_start" else "team slots mismatch") in str(error)
    else:
        raise AssertionError("invalid starting state must abort before replay")
    assert not task.events and task._wwcombo_timed_aborted
    print("OKWW start-state guard passed")
    sys.exit(0)

if mode == "slow_input":
    characters["Augusta"].do_perform()
    assert task.events[:6] == [
        (518, "down", "r"), (1518, "up", "r"),
        (1577, "down", "2"), (1625, "up", "2"),
        (1687, "down", "e"), (1710, "down", "shift"),
    ], task.events[:8]
    assert any("shifting replay clock" in message for message in task.warnings), task.warnings
    print("OKWW overdue inputs retain recorded spacing passed")
    sys.exit(0)

if mode in ("switch_abort", "switch_exhaust"):
    try:
        characters["Augusta"].do_perform()
    except RuntimeError as error:
        assert "scheduled switch did not reach slot 2" in str(error)
    else:
        raise AssertionError("unconfirmed switch must abort")
    assert not any(key == "e" for _, _, key in task.events), task.events
    assert task._wwcombo_timed_aborted and not task._wwcombo_timed_running
    assert len([event for event in task.events if event[1:] == ("down", "2")]) == (1 if mode == "switch_abort" else 3)
    print("OKWW switch failure abort passed")
    sys.exit(0)

if mode in ("switch_retry", "switch_delayed"):
    if mode == "switch_delayed":
        task.switch_hide_after_key_until = 0.9
    characters["Augusta"].do_perform()
    assert task._wwcombo_timed_startup_done
    assert task.active_index == 0
    if mode == "switch_retry":
        assert len([event for event in task.events if event[1:] == ("down", "2")]) == 2, task.events
        assert (1065, "down", "e") in task.events, task.events
        assert round(clock.now * 1000) == 3338, clock.now
    else:
        assert len([event for event in task.events if event[1:] == ("down", "2")]) == 1, task.events
        first_skill = next(at for at, action, key in task.events if action == "down" and key == "e")
        assert 900 <= first_skill <= 950, task.events
        assert (first_skill + 23, "down", "shift") in task.events, task.events
    print("OKWW switch verification recovery passed")
    sys.exit(0)

if mode == "release":
    task.fail_on_key = "r"
    try:
        characters["Augusta"].do_perform()
    except RuntimeError as error:
        assert "injected input failure" in str(error)
    else:
        raise AssertionError("expected injected input failure")
    assert task.events[:2] == [(100, "down", "left"), (518, "down", "r")], task.events
    assert (518, "up", "left") in task.events and (518, "up", "r") in task.events, task.events
    assert task._wwcombo_timed_running is False
    print("OKWW held input release passed")
    sys.exit(0)

if mode == "boundary":
    task.resonance_ready = False
    characters["Augusta"].do_perform()
    assert task.events == [(150, "down", "e"), (200, "up", "e")], task.events
    print("OKWW skipped-window boundary passed")
    sys.exit(0)

if mode in ("chunk", "chunk_gap"):
    for _ in range(10):
        previous = clock.now
        task.chars[task.active_index].do_perform()
        if mode == "chunk_gap" and previous == 0 and round(clock.now * 1000) == 5000:
            clock.sleep(7)
        else:
            assert clock.now - previous <= 5.1, (previous, clock.now)
        if task._wwcombo_timed_startup_done:
            break
    assert task._wwcombo_timed_startup_done
    assert round(clock.now * 1000) == (21900 if mode == "chunk_gap" else 20000)
    assert (100, "down", "e") in task.events
    offset = 1900 if mode == "chunk_gap" else 0
    assert (10100 + offset, "down", "e") in task.events
    assert (15100 + offset, "down", "2") in task.events
    assert (16100 + offset, "down", "q") in task.events
    print("OKWW timed chunked replay passed")
    sys.exit(0)

characters["Augusta"].do_perform()
assert task._wwcombo_timed_startup_done
offset = 200 if delay_mode else 0
assert task.events[:4] == [
    (518 + offset, "down", "r"), (558 + offset, "up", "r"),
    (617 + offset, "down", "2"), (665 + offset, "up", "2")
], task.events[:4]
assert task.events[4:6] == ([(827, "down", "e"), (850, "down", "shift")] if manual_check else
                             [(727 + offset, "down", "e"), (750 + offset, "down", "shift")]), task.events[4:6]
assert task.active_index == 0
assert round(clock.now * 1000) == (3100 if manual_check or post_check else 3000 + offset)
if post_check:
    assert any(875 <= at <= 900 and action == "up" and key == "shift" for at, action, key in task.events), task.events[:15]
assert all(char.is_current_char == (char.index == 0) for char in task.chars)

before = len(task.events)
characters["Augusta"].do_perform()
loop_events = task.events[before:]
assert loop_events[0] == (3200 if manual_check or post_check else 3100 + offset, "down", "3"), loop_events[:4]
assert round(clock.now * 1000) == (5100 if manual_check or post_check else 5000 + offset)
assert task.active_index == 0
print("OKWW timed replay runtime smoke passed")
