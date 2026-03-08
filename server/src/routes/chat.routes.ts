import { Router } from "express";
import { ChatController } from "../controllers/chat.controller";

const router = Router();
const chatController = new ChatController();

router.post("/ask", function (req, res) {
  chatController.ask(req, res);
});
router.get("/history", function (req, res) {
  chatController.getChatHistory(req, res);
});

export default router;
