/* The terminal in the Gemma 4 card: a test fails, the agent reads the code,
   patches one line, and the suite goes green, then it plays again. Every row is
   laid out before it plays and only revealed, so the card keeps one height the
   whole time — the contour field behind the page is sized from the content and
   must not see it grow. */

const ROWS = [
  { cmd: "pytest -q" },
  { fail: "FAILED test_take", note: "[1] != [1, 2]" },
  { agent: "patch utils.py" },
  { del: "    return items[:n - 1]", ln: "14" },
  { add: "    return items[:n]", ln: "14" },
  { cmd: "pytest -q" },
  { ok: "12 passed in 0.31s", note: "offline" },
  { idle: true },
];
const SPIN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const SPARK = "M12 2c0 5.5 4.5 10 10 10-5.5 0-10 4.5-10 10 0-5.5-4.5-10-10-10 5.5 0 10-4.5 10-10z";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function spark() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "gx-spark");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", SPARK);
  p.setAttribute("fill", "currentColor");
  svg.append(p);
  return svg;
}

function buildRow(r) {
  const row = el("div", "gx-row");
  const main = el("span", "gx-main");
  row.append(main);
  const out = { row, typed: null, spin: null, verb: null, r };
  if (r.cmd != null || r.idle) {
    out.typed = el("span", "", "");
    main.append(el("span", "gx-p", "$ "), out.typed);
  } else if (r.fail) {
    main.append(el("span", "gx-bad", r.fail));
  } else if (r.agent) {
    out.spin = el("span", "gx-p", "");
    out.verb = el("span", "", "");
    main.append(el("span", "gx-who"), out.spin, out.verb);
    main.firstChild.append(spark(), "gemma ");
  } else if (r.del || r.add) {
    row.classList.add(r.del ? "gx-del" : "gx-add");
    main.append(el("span", "gx-ln", r.ln), el("span", "gx-sign", r.del ? "-" : "+"), r.del || r.add);
  } else if (r.ok) {
    main.append(el("span", "gx-p", "✓ "), el("span", "gx-good", r.ok));
  }
  if (r.note) row.append(el("span", "gx-note", r.note));
  return out;
}

export function mountAgent(host) {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const screen = el("div", "gx-screen");
  const caret = el("span", "gx-caret");
  const rows = ROWS.map(buildRow);
  for (const r of rows) screen.append(r.row);
  host.append(screen);

  const show = (r) => r.row.classList.add("on");
  const settle = (r) => {
    if (r.typed) r.typed.textContent = r.r.cmd || "";
    if (r.spin) { r.spin.textContent = "▸ "; r.verb.textContent = r.r.agent; }
  };

  if (still) {
    for (const r of rows) { settle(r); show(r); }
    rows[rows.length - 1].row.firstChild.append(caret);
    return { destroy() { screen.remove(); } };
  }

  let alive = true, visible = true;
  const timers = new Set();
  const sleep = (ms) => new Promise((done) => {
    const t = setTimeout(() => { timers.delete(t); done(); }, ms);
    timers.add(t);
  });
  /* One cycle can finish off screen; the next one waits until the card is
     back in view, so a scrolled-past page does no work. */
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(host);

  const typeInto = async (r) => {
    r.typed.parentNode.append(caret);
    const text = r.r.cmd;
    for (let i = 1; i <= text.length && alive; i++) {
      r.typed.textContent = text.slice(0, i);
      await sleep(42 + Math.random() * 46);
    }
  };
  const think = async (r, ms) => {
    r.verb.textContent = "thinking";
    for (let t = 0, i = 0; t < ms && alive; t += 80, i++) {
      r.spin.textContent = SPIN[i % SPIN.length] + " ";
      await sleep(80);
    }
    settle(r);
  };

  const [cmd1, fail, agent, del, add, cmd2, ok, idle] = rows;
  const play = async () => {
    while (alive) {
      while (alive && (!visible || document.hidden)) await sleep(400);
      for (const r of rows) {
        r.row.classList.remove("on");
        if (r.typed) r.typed.textContent = "";
      }
      screen.classList.remove("out");
      show(cmd1);
      await sleep(500);
      await typeInto(cmd1);
      await sleep(320);
      caret.remove();
      show(fail);
      await sleep(750);
      show(agent);
      await think(agent, 1400);
      await sleep(260);
      show(del);
      await sleep(420);
      show(add);
      await sleep(700);
      show(cmd2);
      await typeInto(cmd2);
      await sleep(420);
      caret.remove();
      show(ok);
      await sleep(240);
      show(idle);
      idle.row.firstChild.append(caret);
      await sleep(4600);
      screen.classList.add("out");
      await sleep(420);
    }
  };
  play();

  return {
    destroy() {
      alive = false;
      for (const t of timers) clearTimeout(t);
      io.disconnect();
      screen.remove();
    },
  };
}
