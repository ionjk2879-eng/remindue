package com.remindue.domain.purchase;

import com.remindue.domain.user.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 세 가지 종류(전자제품/온라인주문/정기배송)를 하나의 테이블로 관리한다.
 * 종류별로 쓰는 필드가 다르지만(warrantyMonths, returnDeadlineDays, intervalDays),
 * "등록 → 기한 계산 → 알림"이라는 공통 뼈대를 공유하기 때문에 굳이 테이블을 나누지 않았다.
 * (엔티티 상속(JOINED/SINGLE_TABLE)으로 더 엄격하게 나눌 수도 있지만,
 *  MVP 단계에서는 단일 테이블 + nullable 컬럼이 더 간단하고 충분하다)
 */
@Entity
@Table(name = "purchases")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Purchase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PurchaseType type;

    @Column(nullable = false)
    private String itemName; // 예: "삼성 냉장고", "무신사 자켓", "생수 정기배송"

    @Column(nullable = false)
    private LocalDate baseDate; // 구매일 / 수령일 / 정기배송 시작일(공용 기준일)

    private BigDecimal amount; // 선택 입력

    private String memo;

    // ELECTRONICS 전용
    private Integer warrantyMonths;

    // ONLINE_ORDER 전용 (기본 7일 — 전자상거래법상 청약철회 기간)
    private Integer returnDeadlineDays;

    // RECURRING_DELIVERY 전용
    private Integer intervalDays;

    // RECURRING_DELIVERY 전용 — 마지막으로 배송 완료 처리한 날짜(다음 배송일 계산 기준)
    private LocalDate lastDeliveredDate;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = this.createdAt;
        if (this.type == PurchaseType.RECURRING_DELIVERY && this.lastDeliveredDate == null) {
            this.lastDeliveredDate = this.baseDate;
        }
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Purchase(User user, PurchaseType type, String itemName, LocalDate baseDate,
                     BigDecimal amount, String memo,
                     Integer warrantyMonths, Integer returnDeadlineDays, Integer intervalDays) {
        this.user = user;
        this.type = type;
        this.itemName = itemName;
        this.baseDate = baseDate;
        this.amount = amount;
        this.memo = memo;
        this.warrantyMonths = warrantyMonths;
        this.returnDeadlineDays = returnDeadlineDays;
        this.intervalDays = intervalDays;
    }

    public void update(String itemName, LocalDate baseDate, BigDecimal amount, String memo,
                        Integer warrantyMonths, Integer returnDeadlineDays, Integer intervalDays) {
        this.itemName = itemName;
        this.baseDate = baseDate;
        this.amount = amount;
        this.memo = memo;
        this.warrantyMonths = warrantyMonths;
        this.returnDeadlineDays = returnDeadlineDays;
        this.intervalDays = intervalDays;
    }

    /** 종류에 맞는 "챙겨야 할 기한"을 계산한다. */
    public LocalDate computeDeadline() {
        return switch (type) {
            case ELECTRONICS -> baseDate.plusMonths(warrantyMonths == null ? 12 : warrantyMonths);
            case ONLINE_ORDER -> baseDate.plusDays(returnDeadlineDays == null ? 7 : returnDeadlineDays);
            case RECURRING_DELIVERY -> {
                LocalDate from = lastDeliveredDate == null ? baseDate : lastDeliveredDate;
                yield from.plusDays(intervalDays == null ? 30 : intervalDays);
            }
        };
    }

    /** 정기배송 전용 — "배송 받았음"을 눌렀을 때, 다음 배송일 기준을 오늘로 갱신한다. */
    public void markDelivered(LocalDate deliveredDate) {
        if (type != PurchaseType.RECURRING_DELIVERY) {
            throw new IllegalStateException("정기배송 항목에서만 배송 완료 처리를 할 수 있습니다");
        }
        this.lastDeliveredDate = deliveredDate;
    }
}
