import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { FastResponse } from "srvx";

globalThis.Response = FastResponse;

export default createStartHandler(defaultStreamHandler);
