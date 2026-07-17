package com.remindue.domain.purchase;

public enum PurchaseType {
    ELECTRONICS,        // 가전/전자제품 — 보증기간 관리
    ONLINE_ORDER,       // 온라인 주문 — 환불/반품 기한 체크
    RECURRING_DELIVERY  // 정기배송 — 다음 배송일 관리
}
