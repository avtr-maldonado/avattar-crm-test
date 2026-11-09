-- §58 · Prospectos. El rol Marketing entra al enum en su propio archivo: un
-- valor nuevo de enum no se puede usar en la misma transacción que lo crea.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MARKETING';
