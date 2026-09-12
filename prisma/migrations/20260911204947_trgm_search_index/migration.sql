-- CreateIndex
CREATE INDEX "beneficiaries_name_trgm_idx" ON "beneficiaries" USING GIN ("name_normalized" gin_trgm_ops);
