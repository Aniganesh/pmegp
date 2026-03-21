import { Router } from "express";
import { ChatController } from "../controllers/chat.controller";

const router = Router();
const chatController = new ChatController();

router.post("/ask", function (req, res) {
  chatController.ask(req, res);
});

router.post("/stream", function (req, res) {
  chatController.stream(req, res);
});
router.get("/history", function (req, res) {
  chatController.getChatHistory(req, res);
});
router.get("/usage", function (req, res) {
  chatController.getUsage(req, res);
});
router.post("/validate-key", function (req, res) {
  chatController.validateKey(req, res);
});

export default router;
