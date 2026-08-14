// Authentication and Admin Guard logic
const Auth = {
  currentUser: null,
  profile: null,

  async init() {
    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session);
      if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
        this.handleSignOut();
      } else if (session) {
        await this.handleSignIn(session.user);
      }
    });

    // Re-verify session when returning focus to admin dashboard window/tab
    window.addEventListener('focus', async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        this.handleSignOut();
      }
    });

    // Handle login form submission
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorAlert = document.getElementById('login-error');
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        errorAlert.classList.add('hidden');
        errorAlert.textContent = '';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';

        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (error) throw error;
        } catch (err) {
          console.error('Login error:', err);
          errorAlert.textContent = err.message || 'Failed to sign in. Please check your credentials.';
          errorAlert.classList.remove('hidden');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
      });
    }

    // Initialize Google Sign-In if GSI script is already loaded
    if (window.google && window.google.accounts) {
      window.initGoogleSignIn();
    }

    // Handle logout button clicks
    const logoutBtns = document.querySelectorAll('.logout-btn-action');
    logoutBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await supabase.auth.signOut();
      });
    });
  },

  async handleSignIn(user) {
    try {
      // Show loading spinner
      document.getElementById('login-view').classList.add('hidden');
      document.getElementById('loading-overlay').classList.remove('hidden');

      const isCanonicalAdmin = user.email && user.email.trim().toLowerCase() === 'thewooru@gmail.com';

      // The server is the authority. `is_platform_admin()` requires BOTH
      // app_role = 'admin' AND community_id IS NULL — checking app_role alone
      // let an admin who still carried a community through the gate, after
      // which every platform_* RPC raised and the console filled with errors.
      const { data: isAdminRpc, error: rpcError } = await supabase.rpc('is_platform_admin');
      if (rpcError) {
        console.error('is_platform_admin check failed:', rpcError);
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Profile lookup failed:', error);
      }

      if (!isAdminRpc && !isCanonicalAdmin) {
        if (profile && profile.app_role === 'admin' && profile.community_id) {
          throw new Error(
            'This admin account is still attached to a community. A platform admin must have no community — clear profiles.community_id and sign in again.'
          );
        }
        throw new Error('Access restricted. Only platform admins are allowed.');
      }

      this.profile = profile
        ? { ...profile, app_role: 'admin' }
        : { id: user.id, email: user.email, app_role: 'admin' };

      this.currentUser = user;
      
      // Update header
      document.getElementById('admin-email-display').textContent = user.email;

      // Show app, hide login
      document.getElementById('loading-overlay').classList.add('hidden');
      document.getElementById('app-container').classList.remove('hidden');

      // Initialize router and navigate to dashboard if no hash, otherwise trigger router
      Router.init();
    } catch (err) {
      console.error('Auth verification error:', err);
      await supabase.auth.signOut();
      
      const errorAlert = document.getElementById('login-error');
      if (errorAlert) {
        errorAlert.textContent = err.message;
        errorAlert.classList.remove('hidden');
      }
      
      document.getElementById('loading-overlay').classList.add('hidden');
      document.getElementById('login-view').classList.remove('hidden');
      document.getElementById('app-container').classList.add('hidden');
    }
  },

  handleSignOut() {
    this.currentUser = null;
    this.profile = null;
    
    // Hide app container, show login screen
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    
    // Clear login form fields
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.reset();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    }
  }
};

window.Auth = Auth;

// Google Identity Services (GSI) Callbacks
window.initGoogleSignIn = function() {
  if (window.google && window.google.accounts) {
    google.accounts.id.initialize({
      // Substituted by build-admin.js from EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
      // No bundler here, so process.env is unreachable at runtime.
      client_id: '__GOOGLE_WEB_CLIENT_ID__',
      callback: window.handleGoogleSignInResponse
    });
    
    const container = document.getElementById('google-signin-container');
    if (container) {
      google.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
        width: 340,
        text: 'continue_with',
        shape: 'rectangular'
      });
    }
  }
};

window.handleGoogleSignInResponse = async function(response) {
  const errorAlert = document.getElementById('login-error');
  if (errorAlert) {
    errorAlert.classList.add('hidden');
    errorAlert.textContent = '';
  }

  // Show loading spinner
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('loading-overlay').classList.remove('hidden');

  try {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: response.credential
    });

    if (error) throw error;
  } catch (err) {
    console.error('Google Sign-In error:', err);
    if (errorAlert) {
      errorAlert.textContent = err.message || 'Failed to sign in with Google.';
      errorAlert.classList.remove('hidden');
    }
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
  }
};
