import { render } from "lithent";
import { NotesApp } from "./app/notes-app";
import "./styles/app.css";

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Missing #app root element");
}

render(<NotesApp />, rootElement);

