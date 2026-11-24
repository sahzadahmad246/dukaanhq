package com.dukaanhq.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val DukaanYellow = Color(0xFFFFD331)
val DukaanInk = Color(0xFF1C212A)
private val Light =
    lightColorScheme(
        primary = DukaanYellow,
        onPrimary = DukaanInk,
        primaryContainer = Color(0xFFFFF3BD),
        onPrimaryContainer = DukaanInk,
        background = Color(0xFFF8F7F2),
        onBackground = DukaanInk,
        surface = Color.White,
        onSurface = DukaanInk,
        surfaceVariant = Color(0xFFF0EFE9),
        onSurfaceVariant = Color(0xFF6D706F),
        outline = Color(0xFFDADBD4),
        error = Color(0xFFAB3E28),
        errorContainer = Color(0xFFFFEDE6),
        onErrorContainer = Color(0xFF7A2B1B),
    )
private val Dark =
    darkColorScheme(
        primary = DukaanYellow,
        onPrimary = DukaanInk,
        primaryContainer = Color(0xFF413919),
        onPrimaryContainer = DukaanYellow,
        background = Color(0xFF11151B),
        onBackground = Color(0xFFF8F7F2),
        surface = DukaanInk,
        onSurface = Color(0xFFF8F7F2),
        surfaceVariant = Color(0xFF282D35),
        onSurfaceVariant = Color(0xFFA9AEB4),
        outline = Color(0xFF41464D),
    )
private val Fonts =
    Typography(
        headlineLarge =
            TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 36.sp,
                lineHeight = 42.sp,
                letterSpacing = (-1.3).sp,
            ),
        headlineMedium =
            TextStyle(
                fontWeight = FontWeight.Bold,
                fontSize = 27.sp,
                lineHeight = 34.sp,
                letterSpacing = (-0.7).sp,
            ),
        titleLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 21.sp, lineHeight = 28.sp),
        bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 25.sp),
        bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
        labelLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 20.sp),
    )

@Composable
fun DukaanTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Fonts, content = content)
}
