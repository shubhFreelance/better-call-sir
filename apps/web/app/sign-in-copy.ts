export const signInCopy = {
  en: {
    progress: "Sign-in progress",
    emailStep: "Email",
    verifyStep: "Verify",
    welcome: "Welcome to Better Call Sir",
    checkEmail: "Check your email",
    introduction: "Sign in or create your account with a one-time email code.",
    codeFor: "Enter the code for",
    name: "Your name",
    nameHelp: "Used when creating a new account.",
    email: "Email address",
    sending: "Requesting code…",
    send: "Send sign-in code",
    passwordHelp: "No password to remember. Only enter a code you requested.",
    preview: "Development preview — no email was sent.",
    previewCode: "Use preview code",
    code: "Six-digit code",
    expires: (time: string) =>
      `Expires in ${time}. You can paste the full code.`,
    expired: "This code has expired. Request a new one.",
    wait: "Please wait…",
    verify: "Verify and continue",
    resendIn: (seconds: number) => `Resend in ${seconds}s`,
    resend: "Resend code",
    changeEmail: "Change email",
    permission:
      "Email verification confirms access to your inbox. Student consent and guardian permissions are handled separately.",
    guideTitle: "A space for your learning journey.",
    guideIntro:
      "Find a teacher who fits. Keep enquiries, conversations and tuition choices together.",
    reviewed: "Explore reviewed teacher profiles",
    enquiries: "Manage enquiries and teacher choices",
    privacy: "Stay in control of your information",
    guardian:
      "Students aged 18+ can choose independent signup. Younger learners join through their guardian.",
    errors: {
      nameRequired: "Enter your name.",
      nameLong: "Use 80 characters or fewer.",
      emailInvalid: "Enter a valid email address.",
      codeRequired: "Enter the six-digit code.",
      codeExpired: "This code has expired. Request a new code below.",
      codeWrong:
        "That code is incorrect or expired. Check it or request a new code.",
      emailUnavailable: "Email delivery is unavailable. Please retry later.",
      authUnavailable:
        "Authentication is temporarily unavailable. Please retry later.",
      rateLimited:
        "Too many attempts. Try again after the current limit window.",
      detailsInvalid: "Check your details and try again.",
      signInUnavailable:
        "Sign-in is temporarily unavailable. Please try again later.",
      network: "We couldn’t reach the sign-in service. Please try again.",
    },
  },
  hi: {
    progress: "साइन-इन के चरण",
    emailStep: "ईमेल",
    verifyStep: "पुष्टि",
    welcome: "Better Call Sir में आपका स्वागत है",
    checkEmail: "अपना ईमेल देखें",
    introduction:
      "एक बार इस्तेमाल होने वाले ईमेल कोड से साइन इन करें या खाता बनाएँ।",
    codeFor: "इस ईमेल पर भेजा गया कोड डालें:",
    name: "आपका नाम",
    nameHelp: "नया खाता बनाने के लिए इस्तेमाल होगा।",
    email: "ईमेल पता",
    sending: "कोड भेजा जा रहा है…",
    send: "साइन-इन कोड भेजें",
    passwordHelp:
      "पासवर्ड याद रखने की ज़रूरत नहीं। केवल वही कोड डालें जो आपने माँगा है।",
    preview: "डेवलपमेंट प्रीव्यू — कोई ईमेल नहीं भेजा गया।",
    previewCode: "प्रीव्यू कोड का इस्तेमाल करें",
    code: "छह अंकों का कोड",
    expires: (time: string) =>
      `कोड की वैधता ${time} शेष है। पूरा कोड पेस्ट कर सकते हैं।`,
    expired: "इस कोड की वैधता समाप्त हो गई है। नया कोड मँगाएँ।",
    wait: "कृपया प्रतीक्षा करें…",
    verify: "पुष्टि करके आगे बढ़ें",
    resendIn: (seconds: number) => `${seconds} सेकंड बाद फिर भेजें`,
    resend: "कोड फिर भेजें",
    changeEmail: "ईमेल बदलें",
    permission:
      "ईमेल की पुष्टि से आपके इनबॉक्स तक पहुँच की पुष्टि होती है। विद्यार्थी की सहमति और अभिभावक की अनुमति अलग चरणों में ली जाती हैं।",
    guideTitle: "आपकी पढ़ाई के सफ़र के लिए एक जगह।",
    guideIntro:
      "अपनी ज़रूरत के अनुसार शिक्षक खोजें। पूछताछ, बातचीत और ट्यूशन के विकल्प एक जगह रखें।",
    reviewed: "समीक्षित शिक्षक प्रोफ़ाइल देखें",
    enquiries: "पूछताछ और शिक्षक के विकल्प सँभालें",
    privacy: "अपनी जानकारी पर नियंत्रण रखें",
    guardian:
      "18 वर्ष या अधिक के विद्यार्थी स्वतंत्र साइनअप चुन सकते हैं। कम उम्र के विद्यार्थी अभिभावक के ज़रिए जुड़ते हैं।",
    errors: {
      nameRequired: "अपना नाम डालें।",
      nameLong: "नाम 80 अक्षरों तक रखें।",
      emailInvalid: "सही ईमेल पता डालें।",
      codeRequired: "छह अंकों का कोड डालें।",
      codeExpired: "इस कोड की वैधता समाप्त हो गई है। नीचे से नया कोड मँगाएँ।",
      codeWrong:
        "कोड गलत है या उसकी वैधता समाप्त हो गई है। जाँचें या नया कोड मँगाएँ।",
      emailUnavailable:
        "अभी ईमेल भेजा नहीं जा सका। कुछ देर बाद फिर कोशिश करें।",
      authUnavailable:
        "अभी साइन इन नहीं हो पा रहा है। कुछ देर बाद फिर कोशिश करें।",
      rateLimited: "कई बार कोशिश हो चुकी है। कुछ देर बाद फिर कोशिश करें।",
      detailsInvalid: "अपनी जानकारी जाँचें और फिर कोशिश करें।",
      signInUnavailable:
        "अभी साइन इन उपलब्ध नहीं है। कुछ देर बाद फिर कोशिश करें।",
      network: "साइन-इन सेवा से संपर्क नहीं हो पाया। फिर कोशिश करें।",
    },
  },
};
export type SignInError = keyof typeof signInCopy.en.errors;
