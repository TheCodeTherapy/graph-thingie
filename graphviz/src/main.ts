import { App } from "./app";
import "./style.scss";

async function app() {
  const appElement = document.getElementById("app");

  if (!appElement) {
    throw new Error("App element not found in the DOM. Check your HTML file.");
  }

  new App(appElement);
}

app();
