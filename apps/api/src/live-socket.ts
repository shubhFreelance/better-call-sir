import { inboxSignals } from "./inbox";
import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";

import { AppService, hash, type HttpRequest } from "./shared";
export function liveSocket(server: HttpServer, service: AppService) {
  const origin = process.env.WEB_ORIGIN || "http://localhost:3000";
  const io = new Server(server, {
    path: "/api/v1/live",
    addTrailingSlash: false,
    serveClient: false,
    maxHttpBufferSize: 4096,
    cors: { origin, credentials: true },
    allowRequest: (req, done) =>
      done(
        null,
        req.headers.origin === origin ||
          (!req.headers.origin &&
            req.headers["sec-fetch-site"] === "same-origin"),
      ),
  });
  io.use(async (socket, next) => {
    try {
      await service.limit(
        "live-socket:" + socket.request.socket.remoteAddress,
        60,
      );
      const cookies = Object.fromEntries(
          (socket.request.headers.cookie || "")
            .split(";")
            .map((v) => v.trim().split("=")),
        ),
        req = {
          cookies,
          method: "GET",
          path: "/api/v1/inbox",
          get: () => undefined,
        } as unknown as HttpRequest;
      const a = await service.actor(req, undefined, false);
      const session = await service.db.session.findUnique({
        where: { accessHash: hash(cookies.bcs_access || "") },
      });
      if (!session || session.csrf !== socket.handshake.auth.csrfToken)
        throw Error();
      socket.data.req = req;
      socket.data.accountId = a.id;
      next();
    } catch {
      next(new Error("Sign in again to receive live updates."));
    }
  });
  io.on("connection", (socket) => {
    let signature = "",
      busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const a = await service.actor(socket.data.req, undefined, false);
        if (a.id !== socket.data.accountId) throw Error();
        const latest = await service.db.inboxNotification.findFirst({
            where: { accountId: a.id },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true },
          }),
          unread = await service.db.inboxNotification.count({
            where: { accountId: a.id, readAt: null },
          }),
          value = JSON.stringify([latest?.id, unread]);
        if (value !== signature) {
          signature = value;
          socket.emit("inbox:changed");
        }
      } catch {
        socket.disconnect(true);
      } finally {
        busy = false;
      }
    };
    const changed = () => {
      void check();
    };
    inboxSignals.on("changed", changed);
    void check();
    const timer = setInterval(check, 2000);
    timer.unref();
    socket.on("disconnect", () => {
      clearInterval(timer);
      inboxSignals.off("changed", changed);
    });
  });
  return io;
}
