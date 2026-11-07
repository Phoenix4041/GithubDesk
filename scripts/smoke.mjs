const DEBUG_PORT = process.env.SMOKE_DEBUG_PORT ?? "9222";
const repoPath = process.argv[2];

if (!repoPath) {
  console.error("Usage: node scripts/smoke.mjs <repository-folder>");
  console.error("The app must be running with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=" + DEBUG_PORT);
  process.exit(2);
}

const failures = [];
const problems = [];

async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((target) => target.type === "page");
  if (!page) {
    throw new Error("The app has no open window");
  }
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Cannot reach the debugging port")), { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const handlers = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        handlers?.reject(new Error(JSON.stringify(message.error)));
      } else {
        handlers?.resolve(message.result);
      }
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      problems.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      problems.push(message.params.args.map((argument) => argument.value ?? argument.description).join(" "));
    }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

const client = await connect();
await client.send("Runtime.enable");

async function evaluate(expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(description, expression, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  failures.push(`Timed out waiting for: ${description}`);
  return false;
}

function check(description, condition) {
  console.log(`${condition ? "ok  " : "FAIL"} ${description}`);
  if (!condition) {
    failures.push(description);
  }
}

async function pressKey(key, code, modifiers = 0) {
  const base = { key, code, modifiers, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 27 };
  await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

async function clickText(selector, text) {
  const point = await evaluate(`(() => {
    const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.trim().startsWith(${JSON.stringify(text)}));
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  if (!point) {
    return false;
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  return true;
}

const normalizedPath = repoPath.replaceAll("\\", "/");
await evaluate(`(async () => {
  const info = await window.__TAURI_INTERNALS__.invoke("repo_open", { path: ${JSON.stringify(normalizedPath)} });
  localStorage.setItem("githubdesk.repositories", JSON.stringify({
    state: { recents: [{ path: info.path, name: info.name, lastOpened: Date.now() }], activePath: info.path, lastParentDirectory: null },
    version: 0,
  }));
  location.reload();
})()`);
await new Promise((resolve) => setTimeout(resolve, 1500));

const loaded = await waitFor("the repository workspace", `document.body.innerText.includes("Historial")`);
check("the workspace opens the repository", loaded);

if (loaded) {
  check("the toolbar shows the current branch", await evaluate(`document.querySelectorAll("header button").length > 0`));

  await clickText("button, [role=tab]", "Historial");
  check(
    "the history tab lists commits",
    await waitFor("history rows", `document.querySelectorAll("[role=list] [role=listitem]").length > 0`),
  );

  await clickText("button, [role=tab]", "Cambios");
  check(
    "the changes tab shows the commit box",
    await waitFor("commit box", `document.body.innerText.includes("Hacer commit")`),
  );

  await pressKey("k", "KeyK", 2);
  check("Ctrl+K opens the command palette", await waitFor("palette", `!!document.querySelector("[role=dialog] [role=combobox]")`, 3000));
  await pressKey("Escape", "Escape");
  check("Escape closes the command palette", await waitFor("palette closed", `!document.querySelector("[role=dialog] [role=combobox]")`, 3000));

  await clickText("button", "Etiquetas");
  check("the tags section opens", await waitFor("tags section", `document.body.innerText.includes("Etiquetas")`, 3000));
}

check("no script errors were reported", problems.length === 0);
for (const problem of problems) {
  console.log(`  console error: ${problem}`);
}

client.close();
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nSmoke test passed");
