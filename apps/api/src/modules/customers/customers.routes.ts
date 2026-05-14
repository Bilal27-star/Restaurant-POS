import { Router } from "express";
import { CustomersRepository } from "./customers.repository.js";
import { CustomersService } from "./customers.service.js";
import { CustomersController } from "./customers.controller.js";

const repo = new CustomersRepository();
const service = new CustomersService(repo);
const controller = new CustomersController(service);

export const customersRoutes = Router();

customersRoutes.get("/", controller.list);
customersRoutes.get("/search", controller.search);
customersRoutes.post("/", controller.upsert);
