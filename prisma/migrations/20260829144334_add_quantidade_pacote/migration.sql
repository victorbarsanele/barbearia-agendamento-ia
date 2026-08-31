/*
  Warnings:

  - Added the required column `quantidade` to the `pacotes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "pacotes" ADD COLUMN     "quantidade" INTEGER NOT NULL;
