package com.remindue.purchase;

import com.remindue.purchase.dto.PurchaseRequest;
import com.remindue.purchase.dto.PurchaseResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/purchases")
public class PurchaseController {

    private final PurchaseService purchaseService;

    public PurchaseController(PurchaseService purchaseService) {
        this.purchaseService = purchaseService;
    }

    @GetMapping
    public List<PurchaseResponse> list(@AuthenticationPrincipal UserDetails principal) {
        return purchaseService.getMyPurchases(principal.getUsername());
    }

    @PostMapping
    public ResponseEntity<PurchaseResponse> create(@AuthenticationPrincipal UserDetails principal,
                                                     @Valid @RequestBody PurchaseRequest request) {
        return ResponseEntity.ok(purchaseService.create(principal.getUsername(), request));
    }

    @PutMapping("/{id}")
    public PurchaseResponse update(@AuthenticationPrincipal UserDetails principal,
                                    @PathVariable Long id,
                                    @Valid @RequestBody PurchaseRequest request) {
        return purchaseService.update(principal.getUsername(), id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserDetails principal, @PathVariable Long id) {
        purchaseService.delete(principal.getUsername(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/mark-delivered")
    public PurchaseResponse markDelivered(@AuthenticationPrincipal UserDetails principal, @PathVariable Long id) {
        return purchaseService.markDelivered(principal.getUsername(), id);
    }
}
