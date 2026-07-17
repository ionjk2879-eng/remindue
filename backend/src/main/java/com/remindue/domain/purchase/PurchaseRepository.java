package com.remindue.domain.purchase;

import com.remindue.domain.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PurchaseRepository extends JpaRepository<Purchase, Long> {
    List<Purchase> findByUser(User user);
    List<Purchase> findByUserAndType(User user, PurchaseType type);
}
