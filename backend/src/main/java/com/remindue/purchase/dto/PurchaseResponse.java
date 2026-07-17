package com.remindue.purchase.dto;

import com.remindue.domain.purchase.Purchase;
import com.remindue.domain.purchase.PurchaseType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

public record PurchaseResponse(
        Long id,
        PurchaseType type,
        String itemName,
        LocalDate baseDate,
        BigDecimal amount,
        String memo,
        Integer warrantyMonths,
        Integer returnDeadlineDays,
        Integer intervalDays,
        LocalDate lastDeliveredDate,
        LocalDate deadline,   // 계산된 기한 (보증만료일 / 반품기한 / 다음배송일)
        long dDay,            // 오늘 기준 며칠 남았는지 (음수면 이미 지남)
        LocalDateTime createdAt
) {
    public static PurchaseResponse from(Purchase p) {
        LocalDate deadline = p.computeDeadline();
        long dDay = ChronoUnit.DAYS.between(LocalDate.now(), deadline);
        return new PurchaseResponse(
                p.getId(), p.getType(), p.getItemName(), p.getBaseDate(), p.getAmount(), p.getMemo(),
                p.getWarrantyMonths(), p.getReturnDeadlineDays(), p.getIntervalDays(),
                p.getLastDeliveredDate(), deadline, dDay, p.getCreatedAt()
        );
    }
}
