package com.dukaanhq.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dukaanhq.app.ui.AuthActions
import com.dukaanhq.app.ui.AuthViewModel
import com.dukaanhq.app.ui.DukaanApp
import com.dukaanhq.app.ui.DukaanTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DukaanTheme {
                val repository = (application as DukaanApplication).repository
                val model: AuthViewModel = viewModel(factory = AuthViewModel.factory(repository))
                val state by model.state.collectAsStateWithLifecycle()
                val actions =
                    remember(model) {
                        AuthActions(
                            phone = model::phone,
                            country = model::country,
                            otp = model::otp,
                            name = model::name,
                            intent = model::intent,
                            request = { model.requestOtp() },
                            resend = { model.requestOtp(true) },
                            verify = model::verify,
                            saveName = model::saveName,
                            saveIntent = model::saveIntent,
                            back = model::back,
                            refresh = model::refresh,
                            restore = model::restore,
                            signOut = model::signOut,
                            editName = model::editName,
                            linkPhone = model::linkPhone,
                            changeServer = model::changeServer,
                            checkServer = model::checkServer,
                        )
                    }
                DukaanApp(state, actions)
            }
        }
    }
}
