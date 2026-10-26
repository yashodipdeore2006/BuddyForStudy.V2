import dotenv from "dotenv";
import { getProductionConfigErrors } from "../config/productionConfigValidation.js";

dotenv.config();

const errors = [];
if (process.env.NODE_ENV !== "production") {
  errors.push("NODE_ENV must be set to production for this check");
}
errors.push(...getProductionConfigErrors(process.env));

if (errors.length) {
  console.error("Production configuration validation failed:");
  for (const error of errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log("Production configuration validation passed.");
}
