package com.remindue.purchase.dto;

import com.remindue.domain.purchase.PurchaseType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public record PurchaseRequest(
        @NotNull PurchaseType type,
        @NotBlank String itemName,
        @NotNull LocalDate baseDate,
        BigDecimal amount,
        String memo,
        Integer warrantyMonths,       // ELECTRONICS일 때 사용, 비우면 기본 12개월
        Integer returnDeadlineDays,   // ONLINE_ORDER일 때 사용, 비우면 기본 7일
        Integer intervalDays          // RECURRING_DELIVERY일 때 사용, 비우면 기본 30일
) {}
