-- Optional free-text waiter name on orders (POS "Nom du serveur").
ALTER TABLE "orders" ADD COLUMN "waiter_name" VARCHAR(120);
