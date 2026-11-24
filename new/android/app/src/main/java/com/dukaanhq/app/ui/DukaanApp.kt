package com.dukaanhq.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dukaanhq.app.BuildConfig
import com.dukaanhq.app.R
import com.dukaanhq.app.data.Bootstrap
import kotlinx.coroutines.delay

data class AuthActions(
    val phone: (String) -> Unit = {},
    val country: (String) -> Unit = {},
    val otp: (String) -> Unit = {},
    val name: (String) -> Unit = {},
    val intent: (String) -> Unit = {},
    val request: () -> Unit = {},
    val resend: () -> Unit = {},
    val verify: () -> Unit = {},
    val saveName: () -> Unit = {},
    val saveIntent: () -> Unit = {},
    val back: () -> Unit = {},
    val refresh: () -> Unit = {},
    val restore: () -> Unit = {},
    val signOut: () -> Unit = {},
    val editName: () -> Unit = {},
    val linkPhone: () -> Unit = {},
    val changeServer: (String) -> Unit = {},
    val checkServer: () -> Unit = {},
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DukaanApp(state: AuthUiState, actions: AuthActions) {
    var showCountry by rememberSaveable { mutableStateOf(false) }
    var showConnection by rememberSaveable { mutableStateOf(false) }
    val canGoBack = state.screen == Screen.Otp || state.linkingPhone || state.editingName
    BackHandler(enabled = canGoBack && !state.busy, onBack = actions.back)
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = { BrandBar(state.busy) { showConnection = true } },
    ) { padding ->
        Box(
            Modifier.fillMaxSize().padding(padding).imePadding(),
            contentAlignment = Alignment.TopCenter,
        ) {
            AnimatedContent(
                targetState = state.screen,
                modifier = Modifier.widthIn(max = 500.dp).fillMaxWidth(),
                transitionSpec = {
                    (fadeIn(tween(240)) + slideInHorizontally(tween(280)) { it / 14 }) togetherWith
                        fadeOut(tween(120))
                },
                label = "authScreen",
            ) { screen ->
                Column(
                    Modifier.fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 24.dp)
                        .padding(bottom = 24.dp)
                ) {
                    if (screen !in listOf(Screen.Account, Screen.Restoring, Screen.Recovery)) {
                        ProgressTrail(
                            when (screen) {
                                Screen.Phone -> 0
                                Screen.Otp -> 1
                                else -> 2
                            }
                        )
                        Spacer(Modifier.height(26.dp))
                    }
                    if (
                        canGoBack &&
                            screen !in listOf(Screen.Account, Screen.Restoring, Screen.Recovery)
                    ) {
                        TextButton(
                            onClick = actions.back,
                            enabled = !state.busy,
                            contentPadding = PaddingValues(0.dp),
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                null,
                                Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onBackground,
                            )
                            Spacer(Modifier.width(6.dp))
                            Text("Back", color = MaterialTheme.colorScheme.onBackground)
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    when (screen) {
                        Screen.Phone -> PhoneScreen(state, actions) { showCountry = true }
                        Screen.Otp -> OtpScreen(state, actions)
                        Screen.Name -> NameScreen(state, actions)
                        Screen.Intent -> IntentScreen(state, actions)
                        Screen.Account -> state.bootstrap?.let { AccountScreen(it, state, actions) }
                        Screen.Restoring -> RestoringScreen()
                        Screen.Recovery -> RecoveryScreen(state, actions)
                    }
                }
            }
        }
    }
    if (showCountry)
        CountryPicker(
            state.region,
            onDismiss = { showCountry = false },
            onSelected = {
                actions.country(it)
                showCountry = false
            },
        )
    if (showConnection && BuildConfig.DEBUG)
        ConnectionSheet(state, actions) { showConnection = false }
}

@Composable
private fun BrandBar(busy: Boolean, onConnection: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 24.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painterResource(R.drawable.dukaanhq_logo),
            "DukaanHQ logo",
            Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            "DukaanHQ",
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = (-0.8).sp,
        )
        Spacer(Modifier.weight(1f))
        if (BuildConfig.DEBUG)
            IconButton(onClick = onConnection, enabled = !busy, modifier = Modifier.size(44.dp)) {
                Icon(
                    Icons.Default.Settings,
                    "Connection settings",
                    Modifier.size(21.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
    }
}

@Composable
private fun ProgressTrail(step: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(3) { index ->
            val color by
                animateColorAsState(
                    if (index <= step) DukaanYellow
                    else MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                    label = "progress",
                )
            Box(Modifier.weight(1f).height(4.dp).clip(CircleShape).background(color))
        }
    }
}

@Composable
private fun Eyebrow(text: String) {
    Text(
        text,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.8.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(12.dp))
}

@Composable
private fun Heading(title: String, description: String) {
    Text(title, style = MaterialTheme.typography.headlineLarge)
    Spacer(Modifier.height(14.dp))
    Text(
        description,
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun PhoneScreen(state: AuthUiState, actions: AuthActions, onCountry: () -> Unit) {
    val focus = LocalFocusManager.current
    Eyebrow(if (state.linkingPhone) "SECURE YOUR ACCOUNT" else "YOUR EVERYDAY BUSINESS COMPANION")
    Heading(
        if (state.linkingPhone) "One number.\nYour same account."
        else "Your shop.\nAlways with you.",
        if (state.linkingPhone) "Verify a mobile number to sign in to this account more easily."
        else "A little less paperwork. A little more time for your business.",
    )
    Spacer(Modifier.height(26.dp))
    if (!state.linkingPhone) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)),
        ) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                FeatureLine(
                    Icons.Default.Check,
                    "Stock, bills & your team",
                    "Everything, together.",
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(DukaanYellow))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Built for the way you run your shop.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Spacer(Modifier.height(30.dp))
    }
    FieldLabel("Mobile number")
    val country = remember(state.region) { PhoneNumbers.country(state.region) }
    OutlinedTextField(
        value = state.phone,
        onValueChange = actions.phone,
        modifier = Modifier.fillMaxWidth().testTag("phone_input"),
        enabled = !state.busy,
        singleLine = true,
        shape = RoundedCornerShape(17.dp),
        placeholder = {
            Text(
                if (state.region == "IN") "10-digit mobile number" else "Mobile number",
                fontSize = 15.sp,
            )
        },
        leadingIcon = {
            Row(
                Modifier.clickable(
                        enabled = !state.busy,
                        onClickLabel = "Choose country",
                        onClick = onCountry,
                    )
                    .padding(start = 12.dp, end = 6.dp)
                    .heightIn(min = 48.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(country.flag, fontSize = 20.sp)
                Spacer(Modifier.width(5.dp))
                Text("+${country.callingCode}", fontWeight = FontWeight.SemiBold)
                Icon(Icons.Default.ArrowDropDown, null, Modifier.size(20.dp))
                Box(
                    Modifier.padding(start = 5.dp)
                        .height(24.dp)
                        .width(1.dp)
                        .background(MaterialTheme.colorScheme.outline)
                )
            }
        },
        colors = fieldColors(),
        keyboardOptions =
            KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Done),
        keyboardActions =
            KeyboardActions(
                onDone = {
                    if (state.validPhone) {
                        focus.clearFocus()
                        actions.request()
                    }
                }
            ),
    )
    Spacer(Modifier.height(10.dp))
    Text(
        "We’ll text you a one-time verification code.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Messages(state)
    Spacer(Modifier.height(22.dp))
    val waitingForSameNumber =
        state.resendSeconds > 0 &&
            PhoneNumbers.international(state.phone, state.region) == state.targetPhone
    PrimaryButton(
        if (waitingForSameNumber) "Try again in ${time(state.resendSeconds)}"
        else "Send verification code",
        enabled = state.validPhone && !waitingForSameNumber,
        busy = state.busy,
        tag = "request_otp",
    ) {
        focus.clearFocus()
        actions.request()
    }
    Spacer(Modifier.height(22.dp))
    TrustLine("Your number helps keep your account secure.")
}

@Composable
private fun OtpScreen(state: AuthUiState, actions: AuthActions) {
    Eyebrow("VERIFY YOUR NUMBER")
    Heading("Check your\nmessages.", "Enter the ${state.otpLength}-digit code sent to")
    Text(
        PhoneNumbers.display(state.targetPhone),
        style = MaterialTheme.typography.bodyLarge,
        fontWeight = FontWeight.Bold,
    )
    Spacer(Modifier.height(30.dp))
    val focus = remember { FocusRequester() }
    var focused by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(300)
        focus.requestFocus()
    }
    BasicTextField(
        value = state.otp,
        onValueChange = actions.otp,
        enabled = !state.busy,
        singleLine = true,
        modifier =
            Modifier.fillMaxWidth()
                .focusRequester(focus)
                .onFocusChanged { focused = it.isFocused }
                .testTag("otp_input")
                .semantics { contentDescription = "Verification code" },
        textStyle = LocalTextStyle.current.copy(color = Color.Transparent),
        cursorBrush = SolidColor(Color.Transparent),
        keyboardOptions =
            KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        keyboardActions =
            KeyboardActions(
                onDone = {
                    if (state.otp.length == state.otpLength && state.verifyWaitSeconds == 0)
                        actions.verify()
                }
            ),
        decorationBox = { inner ->
            Box {
                inner()
                Row(
                    Modifier.fillMaxWidth().clearAndSetSemantics {},
                    horizontalArrangement =
                        Arrangement.spacedBy(if (state.otpLength > 6) 4.dp else 7.dp),
                ) {
                    repeat(state.otpLength) { index ->
                        val active =
                            focused && index == state.otp.length.coerceAtMost(state.otpLength - 1)
                        Surface(
                            Modifier.weight(1f).height(if (state.otpLength > 6) 48.dp else 60.dp),
                            shape = RoundedCornerShape(13.dp),
                            color = MaterialTheme.colorScheme.surface,
                            border =
                                BorderStroke(
                                    if (active) 2.dp else 1.dp,
                                    if (active) DukaanYellow else MaterialTheme.colorScheme.outline,
                                ),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    state.otp.getOrNull(index)?.toString() ?: "",
                                    fontSize = if (state.otpLength > 6) 19.sp else 25.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }
            }
        },
    )
    Spacer(Modifier.height(14.dp))
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (state.expirySeconds > 0) "Code expires in ${time(state.expirySeconds)}"
            else "Code expired? Request a new one.",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TextButton(onClick = actions.resend, enabled = state.resendSeconds == 0 && !state.busy) {
            Text(
                if (state.resendSeconds > 0) "Resend in ${time(state.resendSeconds)}"
                else "Resend code",
                color =
                    if (state.resendSeconds > 0) MaterialTheme.colorScheme.onSurfaceVariant
                    else MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
            )
        }
    }
    Messages(state)
    Spacer(Modifier.height(24.dp))
    PrimaryButton(
        if (state.verifyWaitSeconds > 0) "Try again in ${time(state.verifyWaitSeconds)}"
        else "Verify & continue",
        state.otp.length == state.otpLength && state.verifyWaitSeconds == 0,
        state.busy,
        "verify_otp",
        actions.verify,
    )
    Spacer(Modifier.height(24.dp))
    TrustLine("No passwords to remember. Just you, verified.")
}

@Composable
private fun NameScreen(state: AuthUiState, actions: AuthActions) {
    Eyebrow(if (state.editingName) "YOUR PROFILE" else "NICE TO MEET YOU")
    Heading(
        if (state.editingName) "Make it\nyour own." else "What should we\ncall you?",
        "A familiar name makes your shop feel more like you.",
    )
    Spacer(Modifier.height(26.dp))
    Box(
        Modifier.size(76.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        if (state.name.isBlank())
            Icon(
                Icons.Default.Person,
                null,
                Modifier.size(34.dp),
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        else
            Text(
                state.name.trim().take(1).uppercase(),
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
    }
    Spacer(Modifier.height(26.dp))
    FieldLabel("Your name")
    OutlinedTextField(
        state.name,
        actions.name,
        enabled = !state.busy,
        modifier = Modifier.fillMaxWidth().testTag("name_input"),
        placeholder = { Text("Enter your full name") },
        singleLine = true,
        shape = RoundedCornerShape(17.dp),
        colors = fieldColors(),
        keyboardOptions =
            KeyboardOptions(
                capitalization = KeyboardCapitalization.Words,
                imeAction = ImeAction.Done,
            ),
        keyboardActions = KeyboardActions(onDone = { if (state.validName) actions.saveName() }),
    )
    Messages(state)
    Spacer(Modifier.height(24.dp))
    PrimaryButton(
        if (state.editingName) "Save name" else "Continue",
        state.validName,
        state.busy,
        "save_name",
        actions.saveName,
    )
    if (!state.editingName) {
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = actions.signOut, enabled = !state.busy) {
            Text("Use a different account", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun IntentScreen(state: AuthUiState, actions: AuthActions) {
    Eyebrow("A SPACE FOR YOUR BUSINESS")
    Heading("How will you\nuse DukaanHQ?", "Choose where you’d like to start.")
    Spacer(Modifier.height(30.dp))
    val choices = state.bootstrap?.permittedChoices ?: listOf("owner", "staff")
    if ("owner" in choices)
        IntentCard(
            "owner",
            "Register my shop",
            "Create a home for your business.",
            Icons.Default.Home,
            state,
            actions,
        )
    Spacer(Modifier.height(14.dp))
    if ("staff" in choices)
        IntentCard(
            "staff",
            "Join a shop",
            "Work with your shop’s team.",
            Icons.Default.Person,
            state,
            actions,
        )
    Messages(state)
    Spacer(Modifier.height(28.dp))
    PrimaryButton(
        "Continue",
        state.intent in choices,
        state.busy,
        "save_intent",
        actions.saveIntent,
    )
    Spacer(Modifier.height(22.dp))
    Text(
        "Shop access is approved separately. Choosing an option doesn’t grant access to another shop.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun IntentCard(
    value: String,
    title: String,
    subtitle: String,
    icon: ImageVector,
    state: AuthUiState,
    actions: AuthActions,
) {
    val selected = state.intent == value
    Surface(
        modifier =
            Modifier.fillMaxWidth()
                .selectable(
                    selected,
                    enabled = !state.busy,
                    role = Role.RadioButton,
                    onClick = { actions.intent(value) },
                )
                .testTag("intent_$value"),
        shape = RoundedCornerShape(22.dp),
        color = if (selected) DukaanInk else MaterialTheme.colorScheme.surface,
        border =
            BorderStroke(
                if (selected) 2.dp else 1.dp,
                if (selected) DukaanYellow else MaterialTheme.colorScheme.outline,
            ),
    ) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(48.dp)
                    .clip(RoundedCornerShape(15.dp))
                    .background(
                        if (selected) DukaanYellow else MaterialTheme.colorScheme.primaryContainer
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    icon,
                    null,
                    Modifier.size(24.dp),
                    tint =
                        if (selected) DukaanInk else MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    title,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    subtitle,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    color =
                        if (selected) Color(0xFFB7BCC2)
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (selected)
                Icon(Icons.Default.Check, "Selected", Modifier.size(20.dp), tint = DukaanYellow)
        }
    }
}

@Composable
private fun AccountScreen(bootstrap: Bootstrap, state: AuthUiState, actions: AuthActions) {
    val copy = statusCopy(bootstrap)
    Spacer(Modifier.height(14.dp))
    Eyebrow(if (bootstrap.access.workspace) "YOUR EVERYDAY HQ" else "YOUR ACCOUNT")
    Text(
        "Hi, ${bootstrap.account.fullName?.substringBefore(' ') ?: "there"}.",
        style = MaterialTheme.typography.headlineMedium,
    )
    Spacer(Modifier.height(28.dp))
    Surface(
        shape = RoundedCornerShape(26.dp),
        color =
            if (bootstrap.nextAction == "account_suspended")
                MaterialTheme.colorScheme.surfaceVariant
            else DukaanInk,
    ) {
        Column(Modifier.fillMaxWidth().padding(24.dp)) {
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(15.dp)).background(DukaanYellow),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (bootstrap.access.workspace) Icons.Default.Home else Icons.Default.Check,
                    null,
                    tint = DukaanInk,
                )
            }
            Spacer(Modifier.height(22.dp))
            Text(
                copy.first,
                style = MaterialTheme.typography.headlineMedium,
                color =
                    if (bootstrap.nextAction == "account_suspended")
                        MaterialTheme.colorScheme.onSurface
                    else Color.White,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                copy.second,
                style = MaterialTheme.typography.bodyMedium,
                color =
                    if (bootstrap.nextAction == "account_suspended")
                        MaterialTheme.colorScheme.onSurfaceVariant
                    else Color(0xFFC5C9CF),
            )
            if (bootstrap.access.workspace && bootstrap.membership != null) {
                Spacer(Modifier.height(20.dp))
                Surface(shape = CircleShape, color = Color.White.copy(alpha = 0.12f)) {
                    Text(
                        bootstrap.membership.shopSlug,
                        Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                        color = DukaanYellow,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
    Spacer(Modifier.height(24.dp))
    FieldLabel("Account details")
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Name",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                    Text(bootstrap.account.fullName.orEmpty(), fontWeight = FontWeight.SemiBold)
                }
                TextButton(onClick = actions.editName, enabled = !state.busy) {
                    Text(
                        "Edit",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Mobile",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                    )
                    Text(
                        bootstrap.account.phone?.let(PhoneNumbers::display) ?: "Not linked",
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                if (bootstrap.account.phone == null)
                    TextButton(actions.linkPhone, enabled = !state.busy) {
                        Text("Link", color = MaterialTheme.colorScheme.onSurface)
                    }
                else
                    Icon(
                        Icons.Default.Check,
                        "Phone linked",
                        Modifier.size(19.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
            }
        }
    }
    Messages(state)
    Spacer(Modifier.height(24.dp))
    PrimaryButton("Refresh status", busy = state.busy, onClick = actions.refresh)
    TextButton(
        onClick = actions.signOut,
        enabled = !state.busy,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
    ) {
        Text("Sign out", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun statusCopy(bootstrap: Bootstrap): Pair<String, String> =
    when (bootstrap.nextAction) {
        "workspace" ->
            "Your shop is connected." to
                "Your account has workspace access. Inventory and billing will be available in a future app update."
        "select_plan" ->
            "A great start\nfor your shop." to
                "Your account is ready. Plan selection and shop setup will be available in an upcoming update."
        "shop_onboarding" ->
            "Ready for\nyour next chapter." to
                "Your account is eligible for shop setup. We’re preparing that experience for an upcoming update."
        "join_staff" ->
            "Better, together." to
                "Your account is ready to join a team. Ask your shop owner for an invitation. Staff joining will be available in a future update."
        "account_suspended" ->
            "Access is paused." to
                "Your shop or membership is currently paused. Contact your shop owner or administrator, then refresh your status."
        "manage_subscription" ->
            "Your shop needs\na little attention." to
                if (bootstrap.access.canManageSubscription)
                    "Your subscription needs attention. Use the current web app to manage it, then refresh here."
                else
                    "Ask your shop owner to review the shop subscription, then refresh your status."
        "platform_admin" ->
            "Your platform,\nwithin reach." to
                "This account has platform administrator access. Continue using the web admin while the mobile workspace is being built."
        else ->
            "Let’s check\nyour account." to
                "Please refresh your status to continue. No additional shop access has been granted."
    }

@Composable
private fun RestoringScreen() {
    Column(
        Modifier.fillMaxWidth().padding(top = 100.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(
            painterResource(R.drawable.dukaanhq_logo),
            null,
            Modifier.size(82.dp).clip(RoundedCornerShape(24.dp)),
        )
        Spacer(Modifier.height(26.dp))
        Text("Your everyday HQ.", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(24.dp))
        CircularProgressIndicator(
            Modifier.size(25.dp),
            color = MaterialTheme.colorScheme.onSurface,
            strokeWidth = 2.dp,
        )
    }
}

@Composable
private fun RecoveryScreen(state: AuthUiState, actions: AuthActions) {
    Spacer(Modifier.height(50.dp))
    Eyebrow("A MOMENT TO RECONNECT")
    Heading(
        "Let’s get you\nback on track.",
        "Your account is saved securely on this device. We’ll check your access when you reconnect.",
    )
    Messages(state)
    Spacer(Modifier.height(30.dp))
    PrimaryButton("Try again", busy = state.busy, onClick = actions.restore)
    TextButton(actions.signOut, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
        Text("Sign out on this device", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun FeatureLine(icon: ImageVector, title: String, subtitle: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(39.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                icon,
                null,
                Modifier.size(21.dp),
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text(subtitle, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun FieldLabel(value: String) {
    Text(value, style = MaterialTheme.typography.labelLarge)
    Spacer(Modifier.height(10.dp))
}

@Composable
private fun fieldColors() =
    OutlinedTextFieldDefaults.colors(
        focusedBorderColor = MaterialTheme.colorScheme.onSurface,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        focusedContainerColor = MaterialTheme.colorScheme.surface,
        unfocusedContainerColor = MaterialTheme.colorScheme.surface,
    )

@Composable
private fun TrustLine(text: String) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Default.Lock,
            null,
            Modifier.size(13.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(6.dp))
        Text(text, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Messages(state: AuthUiState) {
    val message = state.error ?: state.notice
    AnimatedVisibility(message != null, enter = fadeIn(), exit = fadeOut()) {
        Surface(
            Modifier.fillMaxWidth().padding(top = 16.dp).testTag("feedback"),
            shape = RoundedCornerShape(14.dp),
            color =
                if (state.error != null) MaterialTheme.colorScheme.errorContainer
                else MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Text(
                message.orEmpty(),
                Modifier.padding(14.dp),
                style = MaterialTheme.typography.bodyMedium,
                color =
                    if (state.error != null) MaterialTheme.colorScheme.onErrorContainer
                    else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PrimaryButton(
    text: String,
    enabled: Boolean = true,
    busy: Boolean = false,
    tag: String = "primary_action",
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag(tag),
        shape = RoundedCornerShape(17.dp),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
        colors =
            ButtonDefaults.buttonColors(
                containerColor = DukaanYellow,
                contentColor = DukaanInk,
                disabledContainerColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            ),
    ) {
        if (busy) {
            CircularProgressIndicator(
                Modifier.size(20.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                strokeWidth = 2.dp,
            )
            Spacer(Modifier.width(10.dp))
            Text("Please wait…")
        } else {
            Text(text, Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
            Icon(Icons.AutoMirrored.Filled.ArrowForward, null, Modifier.size(20.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CountryPicker(selected: String, onDismiss: () -> Unit, onSelected: (String) -> Unit) {
    var query by remember { mutableStateOf("") }
    val countries =
        remember(query) {
            PhoneNumbers.countries.filter {
                it.name.contains(query, true) ||
                    it.region.equals(query, true) ||
                    "+${it.callingCode}".contains(query)
            }
        }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.background,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
            Text("Choose your country", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                query,
                { query = it },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                placeholder = { Text("Search country or calling code") },
                leadingIcon = { Icon(Icons.Default.Search, null) },
            )
            Spacer(Modifier.height(12.dp))
            LazyColumn(Modifier.heightIn(max = 400.dp)) {
                items(countries, key = { it.region }) { country ->
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable { onSelected(country.region) }
                            .heightIn(min = 60.dp)
                            .padding(vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(country.flag, fontSize = 25.sp)
                        Spacer(Modifier.width(14.dp))
                        Text(country.name, Modifier.weight(1f), fontSize = 15.sp)
                        Text(
                            "+${country.callingCode}",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (country.region == selected) {
                            Spacer(Modifier.width(10.dp))
                            Icon(Icons.Default.Check, "Selected", Modifier.size(18.dp))
                        }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConnectionSheet(state: AuthUiState, actions: AuthActions, onDismiss: () -> Unit) {
    var endpoint by rememberSaveable { mutableStateOf(state.endpoint) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.background,
    ) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Development connection", style = MaterialTheme.typography.titleLarge)
            Text(
                "Connect this test build to your Nest API. Emulator: 10.0.2.2:4000. USB: use adb reverse, then 127.0.0.1:4000.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                endpoint,
                { endpoint = it },
                label = { Text("API base URL") },
                singleLine = true,
                enabled = !state.busy,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            )
            Text(
                "Changing servers signs out this device. Credentials are never carried to a new server.",
                style = MaterialTheme.typography.bodyMedium,
            )
            state.serverResult?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            state.error?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            PrimaryButton(
                if (state.bootstrap != null) "Save & sign out" else "Use this server",
                busy = state.busy,
            ) {
                actions.changeServer(endpoint)
            }
            OutlinedButton(
                onClick = actions.checkServer,
                enabled =
                    !state.busy && endpoint.trim().trimEnd('/') == state.endpoint.trimEnd('/'),
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp),
                shape = RoundedCornerShape(16.dp),
            ) {
                Text("Check connection", color = MaterialTheme.colorScheme.onSurface)
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text("Done", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private fun time(seconds: Int) = "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"

@Preview(showBackground = true, widthDp = 390, heightDp = 844)
@Composable
private fun PhonePreview() {
    DukaanTheme(dark = false) { DukaanApp(AuthUiState(screen = Screen.Phone), AuthActions()) }
}

@Preview(showBackground = true, widthDp = 390, heightDp = 844)
@Composable
private fun OtpPreview() {
    DukaanTheme(dark = false) {
        DukaanApp(
            AuthUiState(
                screen = Screen.Otp,
                targetPhone = "+919876543210",
                resendSeconds = 45,
                expirySeconds = 280,
            ),
            AuthActions(),
        )
    }
}
