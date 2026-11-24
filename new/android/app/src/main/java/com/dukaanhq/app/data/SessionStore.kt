package com.dukaanhq.app.data

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString

interface SessionStore {
    suspend fun read(): Session?

    suspend fun save(session: Session)

    suspend fun clear()
}

// Synchronous commits run on Dispatchers.IO and must complete before rotated
// credentials are considered saved or the user is considered signed out.
@SuppressLint("ApplySharedPref", "UseKtx")
class KeystoreSessionStore(context: Context) : SessionStore {
    private val preferences =
        context.getSharedPreferences("dukaanhq_credentials", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let {
            return it
        }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply {
                init(
                    KeyGenParameterSpec.Builder(
                            ALIAS,
                            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                        )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setRandomizedEncryptionRequired(true)
                        .build()
                )
            }
            .generateKey()
    }

    override suspend fun read(): Session? =
        withContext(Dispatchers.IO) {
            val value = preferences.getString("session", null) ?: return@withContext null
            try {
                val bytes = Base64.decode(value, Base64.NO_WRAP)
                require(bytes.size > 28)
                val cipher =
                    Cipher.getInstance("AES/GCM/NoPadding").apply {
                        init(
                            Cipher.DECRYPT_MODE,
                            key(),
                            GCMParameterSpec(128, bytes.copyOfRange(0, 12)),
                        )
                    }
                wireJson.decodeFromString<Session>(
                    String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
                )
            } catch (_: Exception) {
                preferences.edit().remove("session").commit()
                runCatching {
                    KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(ALIAS)
                }
                // A missing/invalidated device key means sign in again, never plaintext fallback.
                null
            }
        }

    override suspend fun save(session: Session) =
        withContext(Dispatchers.IO) {
            val cipher =
                Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            val encrypted =
                cipher.iv +
                    cipher.doFinal(wireJson.encodeToString(session).toByteArray(Charsets.UTF_8))
            check(
                preferences
                    .edit()
                    .putString("session", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                    .commit()
            )
        }

    override suspend fun clear() =
        withContext(Dispatchers.IO) { check(preferences.edit().clear().commit()) }

    private companion object {
        const val ALIAS = "dukaanhq.session.v1"
    }
}
