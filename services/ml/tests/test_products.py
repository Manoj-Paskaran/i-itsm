from itsm_ml.classifiers.products import mask_products


def test_masks_row_product_and_all_rule_matches_case_insensitively() -> None:
    assert mask_products("Acme Suite and AWS with VpN", "acme suite") == (
        "PRODUCT and PRODUCT with PRODUCT"
    )


def test_ignores_short_and_empty_row_products_but_masks_rules() -> None:
    assert mask_products("ab and AWS", "ab") == "ab and PRODUCT"
    assert mask_products("AWS", "") == "PRODUCT"
