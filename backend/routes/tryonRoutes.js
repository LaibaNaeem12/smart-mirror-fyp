const express = require("express");
const { tryOn, tryOnStatus } = require("../controllers/tryonController");

const router = express.Router();

// POST / -> mock try-on
router.post("/", tryOn);
router.get("/status/:predictionId", tryOnStatus);
router.get("/predictions/:predictionId", tryOnStatus);

module.exports = router;
