package com.remindue.auth;

import com.remindue.auth.dto.LoginRequest;
import com.remindue.auth.dto.SignupRequest;
import com.remindue.auth.dto.TokenResponse;
import com.remindue.domain.user.User;
import com.remindue.domain.user.UserRepository;
import com.remindue.security.JwtTokenProvider;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder,
                           JwtTokenProvider jwtTokenProvider) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @PostMapping("/signup")
    public ResponseEntity<TokenResponse> signup(@Valid @RequestBody SignupRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            return ResponseEntity.status(409).build(); // 이미 가입된 이메일
        }

        User user = new User(request.email(), passwordEncoder.encode(request.password()), request.nickname());
        userRepository.save(user);

        String token = jwtTokenProvider.createAccessToken(user.getEmail());
        return ResponseEntity.ok(new TokenResponse(token, user.getNickname()));
    }

    @PostMapping("/login")
    public ResponseEntity<TokenResponse> login(@Valid @RequestBody LoginRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다"));

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다");
        }

        String token = jwtTokenProvider.createAccessToken(user.getEmail());
        return ResponseEntity.ok(new TokenResponse(token, user.getNickname()));
    }
}
