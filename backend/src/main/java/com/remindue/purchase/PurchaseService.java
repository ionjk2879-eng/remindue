package com.remindue.purchase;

import com.remindue.domain.purchase.Purchase;
import com.remindue.domain.purchase.PurchaseRepository;
import com.remindue.domain.user.User;
import com.remindue.domain.user.UserRepository;
import com.remindue.purchase.dto.PurchaseRequest;
import com.remindue.purchase.dto.PurchaseResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class PurchaseService {

    private final PurchaseRepository purchaseRepository;
    private final UserRepository userRepository;

    public PurchaseService(PurchaseRepository purchaseRepository, UserRepository userRepository) {
        this.purchaseRepository = purchaseRepository;
        this.userRepository = userRepository;
    }

    /** 기한이 임박한 순서(D-day 오름차순)로 정렬해서 반환한다. */
    public List<PurchaseResponse> getMyPurchases(String email) {
        User user = getUser(email);
        return purchaseRepository.findByUser(user).stream()
                .map(PurchaseResponse::from)
                .sorted(Comparator.comparingLong(PurchaseResponse::dDay))
                .toList();
    }

    @Transactional
    public PurchaseResponse create(String email, PurchaseRequest request) {
        User user = getUser(email);
        Purchase purchase = new Purchase(
                user, request.type(), request.itemName(), request.baseDate(),
                request.amount(), request.memo(),
                request.warrantyMonths(), request.returnDeadlineDays(), request.intervalDays()
        );
        return PurchaseResponse.from(purchaseRepository.save(purchase));
    }

    @Transactional
    public PurchaseResponse update(String email, Long id, PurchaseRequest request) {
        Purchase purchase = getOwned(email, id);
        purchase.update(
                request.itemName(), request.baseDate(), request.amount(), request.memo(),
                request.warrantyMonths(), request.returnDeadlineDays(), request.intervalDays()
        );
        return PurchaseResponse.from(purchase);
    }

    @Transactional
    public void delete(String email, Long id) {
        purchaseRepository.delete(getOwned(email, id));
    }

    /** 정기배송 전용 — "오늘 배송 받았어요" 처리. 다음 배송일 계산 기준을 오늘로 갱신한다. */
    @Transactional
    public PurchaseResponse markDelivered(String email, Long id) {
        Purchase purchase = getOwned(email, id);
        purchase.markDelivered(LocalDate.now());
        return PurchaseResponse.from(purchase);
    }

    private Purchase getOwned(String email, Long id) {
        Purchase purchase = purchaseRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("항목을 찾을 수 없습니다: " + id));
        if (!purchase.getUser().getEmail().equals(email)) {
            throw new SecurityException("본인 소유의 항목만 수정/삭제할 수 있습니다");
        }
        return purchase;
    }

    private User getUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다: " + email));
    }
}
