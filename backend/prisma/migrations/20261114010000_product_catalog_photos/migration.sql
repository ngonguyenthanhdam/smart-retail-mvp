-- Assign the supplied photos only to the matching forecast demo products.
-- Other products and the original image files are left untouched.
UPDATE "products" AS p
SET "image_path" = '/assets/products/' || photo.filename
FROM (VALUES
  ('1', '01_nuoc_khoang_co_ga_330ml.png'),
  ('2', '02_nuoc_cam_co_ga_330ml.png'),
  ('3', '03_sua_tuoi_250ml.png'),
  ('4', '04_gao_tui_1kg.png'),
  ('5', '05_mi_an_lien.png'),
  ('6', '06_banh_mi.png'),
  ('7', '07_chuoi.png'),
  ('8', '08_ca_chua.png'),
  ('9', '09_ca_rot.png'),
  ('10', '10_trung_dong_hop.png'),
  ('11', '11_dau_phong_dong_hop.png'),
  ('12', '12_khoai_tay.png'),
  ('13', '13_ca_phi_le.png'),
  ('14', '14_thit_ga.png'),
  ('15', '15_sua_chua.png'),
  ('16', '16_dau_an_1_lit.png'),
  ('17', '17_nuoc_rua_chen_750_ml.png'),
  ('18', '18_tao.png'),
  ('19', '19_ca_phe_goi_250_g.png'),
  ('20', '20_khan_giay_hop.png')
) AS photo(external_id, filename)
WHERE p."external_source" = 'RETAILSENSE_SYNTHETIC_V1'
  AND p."external_id" = photo.external_id
  AND p."sku" = 'FC-' || LPAD(photo.external_id, 2, '0')
  AND p."deleted_at" IS NULL;
