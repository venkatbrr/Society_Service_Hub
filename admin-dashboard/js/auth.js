// Authentication and Admin Guard logic
const Auth = {
  currentUser: null,
  profile: null,

  async init() {
    // Listen for auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session);
      if (session) {
        await this.handleSignIn(session.user);
      } else {
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

      // Fetch user profile to verify role
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        // Fallback: check RPC if profile select fails (e.g. due to policy)
        const { data: isAdminRpc, error: rpcError } = await supabase.rpc('is_platform_admin');
        if (rpcError || !isAdminRpc) {
          throw new Error('Access restricted. Only platform admins are allowed.');
        }
        
        // Mock profile for admin if query failed but RPC succeeded
        this.profile = { id: user.id, email: user.email, app_role: 'admin' };
      } else {
        // Check if role is admin
        if (profile.app_role !== 'admin') {
          throw new Error('Access restricted. Only platform admins are allowed.');
        }
        this.profile = profile;
      }

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
      client_id: '39089637830-umcdd6qvaii40qpcmfjlv90fguk4bjlq.apps.googleusercontent.com',
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
