# Regole per R8, lo strumento di Android che toglie dall'APK il codice delle librerie che l'app non usa.
# Il ponte tra la pagina web e Android (Capacitor) trova i plugin e i loro metodi per nome, con la
# "reflection": per sicurezza le classi di Capacitor, dei plugin e dell'app restano intere.
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class io.ionic.libs.** { *; }
-keep class org.apache.cordova.** { *; }
-keep class com.nikcirri.lupus.** { *; }

# Metodi che la pagina web chiama direttamente.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Numeri di riga negli errori: utili se un giorno l'app si chiudesse da sola.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
