import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Bath,
  Bell,
  Camera,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Footprints,
  Home,
  Lock,
  Mail,
  PawPrint,
  Pill,
  Plus,
  Search,
  Settings,
  Trophy,
  User,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { cn, type Activity, type FamilyMember, type Pet, type Screen, type Task } from './types';
import {
  addPet,
  assignTask,
  completeTask,
  createFamily,
  ensureProfile,
  getUserFamily,
  joinFamily,
  loadFamilyBundle,
  registerActivity,
  type FamilyInfo,
  type NewPetInput,
  updatePet,
  type UpdatePetInput,
} from './services/familyApi';

interface LoginScreenProps {
  loading: boolean;
  resendingConfirmation: boolean;
  email: string;
  password: string;
  pendingConfirmationEmail: string | null;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => Promise<void>;
  onResendConfirmation: () => Promise<void>;
  onGoRegister: () => void;
}

interface RegisterScreenProps {
  loading: boolean;
  name: string;
  email: string;
  password: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRegister: () => Promise<void>;
  onGoLogin: () => void;
}

interface FamilySelectScreenProps {
  onCreate: () => void;
  onJoin: () => void;
  onLogout: () => Promise<void>;
}

interface CreateFamilyScreenProps {
  loading: boolean;
  familyName: string;
  onFamilyNameChange: (value: string) => void;
  onCreateFamily: () => Promise<void>;
  onBack: () => void;
}

interface JoinFamilyScreenProps {
  loading: boolean;
  code: string;
  onCodeChange: (value: string) => void;
  onJoinFamily: () => Promise<void>;
  onBack: () => void;
}

interface RankingScreenProps {
  family: FamilyInfo;
  members: FamilyMember[];
  activities: Activity[];
  onNavigate: (screen: Screen) => void;
}

interface PetsScreenProps {
  pets: Pet[];
  members: FamilyMember[];
  onAddPet: (petData: NewPetInput) => Promise<void>;
  onOpenPetDetails: (petId: string) => void;
  onNavigate: (screen: Screen) => void;
}

interface EditPetScreenProps {
  pet: Pet;
  onBack: () => void;
  onSave: (petData: UpdatePetInput) => Promise<void>;
}

interface TasksScreenProps {
  tasks: Task[];
  pets: Pet[];
  currentUser: SupabaseUser;
  family: FamilyInfo;
  onRefresh: () => Promise<void>;
  onNavigate: (screen: Screen) => void;
}

interface FamilyProfileScreenProps {
  family: FamilyInfo;
  members: FamilyMember[];
  tasks: Task[];
  currentUserName: string;
  currentUserAvatar: string;
  onLogout: () => Promise<void>;
  onNavigate: (screen: Screen) => void;
}

interface NotificationsScreenProps {
  activities: Activity[];
  onNavigate: (screen: Screen) => void;
}

interface EditProfileScreenProps {
  loading: boolean;
  initialName: string;
  initialAvatar: string;
  onBack: () => void;
  onSave: (name: string, avatarFile: File | null, avatarUrl: string) => Promise<void>;
}

const EMPTY_ACTIVITIES: Activity[] = [];
const EMPTY_TASKS: Task[] = [];
const EMPTY_PETS: Pet[] = [];
const EMPTY_MEMBERS: FamilyMember[] = [];

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [family, setFamily] = useState<FamilyInfo | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>(EMPTY_MEMBERS);
  const [pets, setPets] = useState<Pet[]>(EMPTY_PETS);
  const [tasks, setTasks] = useState<Task[]>(EMPTY_TASKS);
  const [activities, setActivities] = useState<Activity[]>(EMPTY_ACTIVITIES);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);

  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  const [familyName, setFamilyName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setUser(data.session?.user ?? null);
      } catch {
        toast.error('Nao foi possivel validar sua sessao.');
      } finally {
        setBootstrapping(false);
      }
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (bootstrapping) {
      return;
    }

    let cancelled = false;

    const resolveInitialScreen = async () => {
      if (!user) {
        setFamily(null);
        setMembers(EMPTY_MEMBERS);
        setPets(EMPTY_PETS);
        setTasks(EMPTY_TASKS);
        setActivities(EMPTY_ACTIVITIES);
        setCurrentScreen('login');
        return;
      }

      try {
        await ensureProfile(user, registerName || undefined);
        const foundFamily = await getUserFamily(user.id);

        if (!foundFamily) {
          if (!cancelled) {
            setFamily(null);
            setCurrentScreen('family-select');
          }
          return;
        }

        await refreshFamily(foundFamily.id, !cancelled);
        if (!cancelled) {
          setCurrentScreen('ranking');
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Erro inesperado.';
          toast.error(message);
          setCurrentScreen('family-select');
        }
      }
    };

    resolveInitialScreen();

    return () => {
      cancelled = true;
    };
  }, [bootstrapping, user]);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => b.points - a.points),
    [members]
  );

  const currentMember = useMemo(
    () => members.find((member) => member.id === user?.id) || null,
    [members, user]
  );

  async function refreshFamily(familyId: string, shouldUpdate = true) {
    const bundle = await loadFamilyBundle(familyId);

    if (!shouldUpdate) {
      return;
    }

    setFamily(bundle.family);
    setMembers(bundle.members);
    setPets(bundle.pets);
    setTasks(bundle.tasks);
    setActivities(bundle.activities);
  }

  async function handleLogin() {
    if (!loginEmail || !loginPassword) {
      toast.error('Preencha e-mail e senha.');
      return;
    }

    setLoadingAction(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        throw error;
      }

      toast.success('Login realizado com sucesso.');
      setLoginPassword('');
      setPendingConfirmationEmail(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no login.';

      if (message.toLowerCase().includes('email not confirmed')) {
        setPendingConfirmationEmail(loginEmail.trim());
      }

      toast.error(message);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleResendConfirmation() {
    const targetEmail = (pendingConfirmationEmail || loginEmail).trim();
    if (!targetEmail) {
      toast.error('Informe seu e-mail para reenviar a confirmacao.');
      return;
    }

    setResendingConfirmation(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        throw error;
      }

      toast.success('E-mail de confirmacao reenviado. Verifique sua caixa de entrada.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao reenviar confirmacao.';
      toast.error(message);
    } finally {
      setResendingConfirmation(false);
    }
  }

  async function handleRegister() {
    if (!registerName || !registerEmail || !registerPassword) {
      toast.error('Preencha nome, e-mail e senha.');
      return;
    }

    setLoadingAction(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: registerEmail.trim(),
        password: registerPassword,
        options: {
          data: {
            full_name: registerName.trim(),
          },
        },
      });

      if (error) {
        throw error;
      }

      if (!data.session) {
        toast.success('Conta criada. Confirme seu e-mail e depois faca login.');
        setLoginEmail(registerEmail.trim());
        setPendingConfirmationEmail(registerEmail.trim());
        setCurrentScreen('login');
      } else {
        toast.success('Conta criada com sucesso.');
        setPendingConfirmationEmail(null);
        setCurrentScreen('family-select');
      }

      setRegisterPassword('');
      setRegisterEmail('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao criar conta.';
      toast.error(message);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleLogout() {
    setLoadingAction(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      setCurrentScreen('login');
      toast.success('Voce saiu da conta.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao sair da conta.';
      toast.error(message);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleCreateFamily() {
    if (!user) {
      toast.error('Sessao expirada. Faca login novamente.');
      setCurrentScreen('login');
      return;
    }

    setLoadingAction(true);
    try {
      const created = await createFamily(user, familyName);
      await refreshFamily(created.id);
      setFamilyName('');
      setCurrentScreen('ranking');
      toast.success('Familia criada com sucesso.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel criar familia.';
      toast.error(message);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleJoinFamily() {
    if (!user) {
      toast.error('Sessao expirada. Faca login novamente.');
      setCurrentScreen('login');
      return;
    }

    setLoadingAction(true);
    try {
      const joined = await joinFamily(user, joinCode);
      await refreshFamily(joined.id);
      setJoinCode('');
      setCurrentScreen('ranking');
      toast.success('Voce entrou na familia com sucesso.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel entrar na familia.';
      toast.error(message);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleAddPet(petData: NewPetInput) {
    if (!family || !user) {
      toast.error('Crie ou entre em uma familia antes.');
      return;
    }

    if (!petData.name.trim()) {
      toast.error('Digite um nome valido para o pet.');
      return;
    }

    try {
      await addPet(family.id, petData, user.id);
      await refreshFamily(family.id);
      toast.success('Pet adicionado com sucesso.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel adicionar o pet.';
      toast.error(message);
    }
  }

  async function handleRefreshData() {
    if (!family) {
      return;
    }

    try {
      await refreshFamily(family.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel atualizar dados.';
      toast.error(message);
    }
  }

  function handleOpenPetDetails(petId: string) {
    setSelectedPetId(petId);
    setCurrentScreen('edit-pet');
  }

  async function handleUpdatePet(petData: UpdatePetInput) {
    if (!family || !selectedPetId || !user) {
      toast.error('Pet nao encontrado para edicao.');
      return;
    }

    setLoadingAction(true);
    try {
      await updatePet(selectedPetId, family.id, user.id, petData);
      await refreshFamily(family.id);
      toast.success('Dados do pet atualizados com sucesso.');
      setCurrentScreen('pets');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel atualizar o pet.';
      toast.error(message);
    } finally {
      setLoadingAction(false);
    }
  }

  async function handleUpdateProfile(name: string, avatarFile: File | null, avatarUrl: string) {
    if (!user) {
      toast.error('Sessao expirada. Faca login novamente.');
      setCurrentScreen('login');
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Informe seu nome.');
      return;
    }

    setLoadingAction(true);
    try {
      let finalAvatarUrl = avatarUrl.trim();

      if (avatarFile) {
        const extension = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const filePath = `avatars/${user.id}-${Date.now()}.${extension}`;

        const { error: uploadError } = await supabase.storage.from('pet-images').upload(filePath, avatarFile, {
          upsert: true,
          contentType: avatarFile.type || 'image/jpeg',
        });

        if (uploadError) {
          if (uploadError.message.toLowerCase().includes('bucket not found')) {
            // Fallback to data URL when Storage bucket is not provisioned yet.
            finalAvatarUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem selecionada.'));
              reader.readAsDataURL(avatarFile);
            });
          } else {
            throw uploadError;
          }
        } else {
          const { data } = supabase.storage.from('pet-images').getPublicUrl(filePath);
          finalAvatarUrl = data.publicUrl;
        }
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: cleanName,
          avatar_url: finalAvatarUrl || null,
        })
        .eq('id', user.id);

      if (profileError) {
        throw profileError;
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: cleanName },
      });

      if (authError) {
        throw authError;
      }

      if (family) {
        await refreshFamily(family.id);
      }

      toast.success('Perfil atualizado com sucesso.');
      setCurrentScreen('family-profile');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel atualizar perfil.';
      toast.error(message);
    } finally {
      setLoadingAction(false);
    }
  }

  if (bootstrapping && currentScreen === 'splash') {
    return <SplashScreen />;
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'login':
        return (
          <LoginScreen
            loading={loadingAction}
            resendingConfirmation={resendingConfirmation}
            email={loginEmail}
            password={loginPassword}
            pendingConfirmationEmail={pendingConfirmationEmail}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            onEmailChange={(value) => {
              setLoginEmail(value);
              if (pendingConfirmationEmail && value.trim() !== pendingConfirmationEmail) {
                setPendingConfirmationEmail(null);
              }
            }}
            onPasswordChange={setLoginPassword}
            onLogin={handleLogin}
            onResendConfirmation={handleResendConfirmation}
            onGoRegister={() => setCurrentScreen('register')}
          />
        );
      case 'register':
        return (
          <RegisterScreen
            loading={loadingAction}
            name={registerName}
            email={registerEmail}
            password={registerPassword}
            onNameChange={setRegisterName}
            onEmailChange={setRegisterEmail}
            onPasswordChange={setRegisterPassword}
            onRegister={handleRegister}
            onGoLogin={() => setCurrentScreen('login')}
          />
        );
      case 'family-select':
        return (
          <FamilySelectScreen
            onCreate={() => setCurrentScreen('create-family')}
            onJoin={() => setCurrentScreen('join-family')}
            onLogout={handleLogout}
          />
        );
      case 'create-family':
        return (
          <CreateFamilyScreen
            loading={loadingAction}
            familyName={familyName}
            onFamilyNameChange={setFamilyName}
            onCreateFamily={handleCreateFamily}
            onBack={() => setCurrentScreen('family-select')}
          />
        );
      case 'join-family':
        return (
          <JoinFamilyScreen
            loading={loadingAction}
            code={joinCode}
            onCodeChange={setJoinCode}
            onJoinFamily={handleJoinFamily}
            onBack={() => setCurrentScreen('family-select')}
          />
        );
      case 'pets':
        return (
          <PetsScreen
            pets={pets}
            members={members}
            onAddPet={handleAddPet}
            onOpenPetDetails={handleOpenPetDetails}
            onNavigate={setCurrentScreen}
          />
        );
      case 'edit-pet': {
        const selectedPet = pets.find((pet) => pet.id === selectedPetId);
        if (!selectedPet) {
          return <PetsScreen pets={pets} members={members} onAddPet={handleAddPet} onOpenPetDetails={handleOpenPetDetails} onNavigate={setCurrentScreen} />;
        }

        return (
          <EditPetScreen
            pet={selectedPet}
            onBack={() => setCurrentScreen('pets')}
            onSave={handleUpdatePet}
          />
        );
      }
      case 'tasks':
        if (!user || !family) {
          return <SplashScreen />;
        }
        return (
          <TasksScreen
            tasks={tasks}
            pets={pets}
            currentUser={user}
            family={family}
            onRefresh={handleRefreshData}
            onNavigate={setCurrentScreen}
          />
        );
      case 'notifications':
        return (
          <NotificationsScreen
            activities={activities}
            onNavigate={setCurrentScreen}
          />
        );
      case 'family-profile':
        if (!family) {
          return <SplashScreen />;
        }
        return (
          <FamilyProfileScreen
            family={family}
            members={members}
            tasks={tasks}
            currentUserName={currentMember?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Membro'}
            currentUserAvatar={currentMember?.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200'}
            onLogout={handleLogout}
            onNavigate={setCurrentScreen}
          />
        );
      case 'edit-profile':
        return (
          <EditProfileScreen
            loading={loadingAction}
            initialName={currentMember?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''}
            initialAvatar={currentMember?.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200'}
            onBack={() => setCurrentScreen('ranking')}
            onSave={handleUpdateProfile}
          />
        );
      case 'ranking':
      default:
        if (!family) {
          return <SplashScreen />;
        }
        return (
          <RankingScreen
            family={family}
            members={sortedMembers}
            activities={activities}
            onNavigate={setCurrentScreen}
          />
        );
    }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-background-dark overflow-hidden relative shadow-2xl">
      <Toaster position="top-center" theme="dark" richColors />
      <AnimatePresence mode="wait">
        <motion.div
          key={currentScreen}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="h-full w-full"
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SplashScreen() {
  return (
    <div className="h-full flex flex-col items-center justify-between py-16 px-8 bg-mesh">
      <div className="grow flex flex-col items-center justify-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150" />
          <div className="relative flex items-center justify-center w-40 h-40 bg-primary/10 rounded-full border border-primary/20">
            <PawPrint className="w-24 h-24 text-primary" />
          </div>
        </div>
        <div className="text-center">
          <h1 className="font-brand text-6xl text-slate-100 tracking-tight mb-2">PetFamily</h1>
          <p className="text-primary font-medium text-xl tracking-wide">Cuide em familia</p>
        </div>
      </div>
      <div className="w-full max-w-xs space-y-4">
        <p className="text-slate-400 text-sm font-medium tracking-widest uppercase text-center">Conectando com seu lar</p>
        <div className="h-1.5 w-full bg-primary/10 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
            className="h-full bg-primary rounded-full"
          />
        </div>
      </div>
    </div>
  );
}

function LoginScreen(props: LoginScreenProps) {
  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar">
      <div className="p-4 flex items-center justify-between">
        <h2 className="font-bold text-lg">PetFamily</h2>
        <button onClick={props.onGoRegister} className="text-primary text-sm font-bold">Criar conta</button>
      </div>

      {props.pendingConfirmationEmail && (
        <div className="mx-6 mt-2 p-4 rounded-xl border border-amber-400/30 bg-amber-500/10">
          <p className="text-sm text-amber-200">
            E-mail nao confirmado para <span className="font-bold">{props.pendingConfirmationEmail}</span>.
          </p>
          <button
            onClick={props.onResendConfirmation}
            disabled={props.resendingConfirmation}
            className="mt-3 text-xs font-bold uppercase tracking-wider text-amber-300 disabled:opacity-60"
          >
            {props.resendingConfirmation ? 'Reenviando...' : 'Reenviar confirmacao'}
          </button>
        </div>
      )}

      <div className="px-6 pt-8 pb-4 text-center">
        <h1 className="text-3xl font-bold mb-2">Bem-vindo de volta</h1>
        <p className="text-slate-400">Acesse sua conta para cuidar dos seus pets</p>
      </div>

      <div className="px-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">E-mail</label>
          <input
            type="email"
            value={props.email}
            onChange={(event) => props.onEmailChange(event.target.value)}
            placeholder="Seu e-mail"
            className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-4 focus:ring-2 focus:ring-primary outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Senha</label>
          <div className="relative">
            <input
              type={props.showPassword ? 'text' : 'password'}
              value={props.password}
              onChange={(event) => props.onPasswordChange(event.target.value)}
              placeholder="Sua senha"
              className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-4 focus:ring-2 focus:ring-primary outline-none"
            />
            <button
              onClick={() => props.setShowPassword(!props.showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
            >
              {props.showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <button
          disabled={props.loading}
          onClick={props.onLogin}
          className="w-full h-14 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 disabled:opacity-60"
        >
          {props.loading ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

function RegisterScreen(props: RegisterScreenProps) {
  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar">
      <div className="p-4 flex items-center">
        <button onClick={props.onGoLogin} className="p-2 text-slate-100"><ArrowLeft /></button>
        <h2 className="flex-1 text-center font-bold text-lg pr-10">Criar Conta</h2>
      </div>

      <div className="px-6 space-y-4 py-4">
        <InputWithIcon icon={<User size={20} />} label="Nome completo" value={props.name} onChange={props.onNameChange} />
        <InputWithIcon icon={<Mail size={20} />} label="Email" value={props.email} onChange={props.onEmailChange} />
        <InputWithIcon icon={<Lock size={20} />} label="Senha" value={props.password} type="password" onChange={props.onPasswordChange} />
      </div>

      <div className="px-6 py-6">
        <button
          disabled={props.loading}
          onClick={props.onRegister}
          className="w-full h-14 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {props.loading ? 'Criando...' : 'Criar Conta'} <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}

function FamilySelectScreen(props: FamilySelectScreenProps) {
  return (
    <div className="h-full flex flex-col gradient-bg">
      <header className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg text-white"><PawPrint size={20} /></div>
          <span className="font-bold text-xl">PetFamily</span>
        </div>
        <button onClick={props.onLogout} className="text-xs uppercase tracking-wider text-slate-300">Sair</button>
      </header>

      <main className="flex-1 px-6 pt-8 flex flex-col overflow-y-auto custom-scrollbar pb-24">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold mb-2">Sua Familia</h1>
          <p className="text-slate-400 text-lg">Como voce quer entrar?</p>
        </div>

        <div className="space-y-6">
          <SelectionCard
            title="Criar uma Familia"
            description="Comece um novo grupo para gerenciar seus pets e convidar membros da casa."
            icon={<Home size={32} />}
            buttonText="Criar Agora"
            onClick={props.onCreate}
            primary
          />
          <SelectionCard
            title="Entrar em uma Familia"
            description="Recebeu um convite? Insira o codigo da sua familia para comecar."
            icon={<Mail size={32} />}
            buttonText="Inserir Codigo"
            onClick={props.onJoin}
          />
        </div>
      </main>
    </div>
  );
}

function CreateFamilyScreen(props: CreateFamilyScreenProps) {
  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar">
      <header className="p-4 flex items-center justify-between">
        <button onClick={props.onBack} className="p-2 text-primary"><ArrowLeft /></button>
        <h2 className="font-bold text-lg">Criar Familia</h2>
        <div className="w-10" />
      </header>

      <div className="px-6 pt-8 pb-4">
        <h1 className="text-3xl font-bold mb-2">Criar sua Familia</h1>
        <p className="text-slate-400">Diga o nome do seu grupo e gere o codigo de convite.</p>
      </div>

      <div className="px-6 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Nome da Familia</label>
          <input
            value={props.familyName}
            onChange={(event) => props.onFamilyNameChange(event.target.value)}
            placeholder="Ex: Familia Silva"
            className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-4 focus:ring-2 focus:ring-primary outline-none"
          />
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Codigo de Convite</span>
            <Settings size={16} className="text-primary" />
          </div>
          <div className="bg-black/20 rounded-lg p-4 border border-white/5">
            <p className="text-sm text-slate-300">O codigo real sera gerado automaticamente apos criar a familia.</p>
          </div>
        </div>
      </div>

      <div className="mt-auto p-6">
        <button
          disabled={props.loading}
          onClick={props.onCreateFamily}
          className="w-full h-14 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Plus size={20} /> {props.loading ? 'Criando...' : 'Criar Agora'}
        </button>
      </div>
    </div>
  );
}

function JoinFamilyScreen(props: JoinFamilyScreenProps) {
  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar">
      <header className="p-6 flex items-center justify-between">
        <button onClick={props.onBack} className="p-2 bg-primary/10 text-primary rounded-xl"><ArrowLeft /></button>
        <span className="font-bold text-xl">PetFamily</span>
        <div className="w-10" />
      </header>

      <main className="flex-1 px-6 pt-8 flex flex-col">
        <div className="mb-12">
          <h1 className="text-3xl font-bold mb-4">Entrar na Familia</h1>
          <p className="text-slate-400 text-lg">Insira o codigo enviado pelo administrador da familia.</p>
        </div>

        <input
          value={props.code}
          onChange={(event) => props.onCodeChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          maxLength={8}
          placeholder="EX: ABC123"
          className="w-full h-14 text-center text-2xl font-bold bg-white/5 border-2 border-white/10 rounded-xl focus:border-primary focus:ring-1 focus:ring-primary outline-none uppercase tracking-[0.35rem]"
        />

        <div className="mt-auto space-y-4 pb-10 pt-8">
          <button
            disabled={props.loading}
            onClick={props.onJoinFamily}
            className="w-full h-14 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 disabled:opacity-60"
          >
            {props.loading ? 'Validando...' : 'Validar Codigo'}
          </button>
        </div>
      </main>
    </div>
  );
}

function RankingScreen(props: RankingScreenProps) {
  const podium = props.members.slice(0, 3);
  const rest = props.members.slice(3);

  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar pb-24">
      <header className="sticky top-0 z-10 bg-background-dark/80 backdrop-blur-md border-b border-white/5 p-4 flex items-center justify-between">
        <div>
          <h1 className="font-brand text-xl font-bold text-primary leading-none">PetFamily</h1>
          <p className="text-[10px] text-slate-500 font-medium">{props.family.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => props.onNavigate('edit-profile')} className="p-2 bg-primary/10 text-primary rounded-xl" aria-label="Abrir perfil">
            <User size={20} />
          </button>
          <button onClick={() => props.onNavigate('notifications')} className="p-2 bg-primary/10 text-primary rounded-xl relative" aria-label="Abrir notificacoes">
            <Bell size={20} />
          </button>
        </div>
      </header>

      <main className="p-4 space-y-8">
        <section>
          <h2 className="text-center font-brand text-2xl font-bold mb-8">Ranking da Familia</h2>
          <div className="space-y-3">
            {podium.map((member, index) => (
              <div key={member.id} className={cn('rounded-xl p-3 border', index === 0 ? 'bg-primary/10 border-primary/30' : 'bg-white/5 border-white/5')}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">#{index + 1} {member.name}</span>
                  <span className="text-primary font-bold">{member.points} pts</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="font-brand text-lg font-bold flex items-center gap-2">
            <Calendar size={20} className="text-primary" /> Classificacao Geral
          </h3>
          <div className="space-y-3">
            {rest.length === 0 && <p className="text-slate-500 text-sm">Adicione mais membros para formar ranking.</p>}
            {rest.map((member, i) => (
              <div key={member.id} className="bg-white/5 p-3 rounded-xl border border-white/5 flex items-center gap-3">
                <span className="font-bold text-slate-500 w-6">{i + 4}</span>
                <div className="w-10 h-10 rounded-full overflow-hidden">
                  <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-end mb-1">
                    <p className="font-bold text-sm">{member.name}</p>
                    <p className="text-xs font-bold text-primary">{member.points} pts</p>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{member.tasksCompleted} tarefas concluidas</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="font-brand text-lg font-bold flex items-center gap-2">
            <Settings size={20} className="text-primary" /> Atividades Recentes
          </h3>
          <div className="space-y-3">
            {props.activities.length === 0 && <p className="text-slate-500 text-sm">Ainda sem atividades registradas.</p>}
            {props.activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/5">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  {activity.type === 'food' && <PawPrint size={16} className="text-primary" />}
                  {activity.type === 'walk' && <Footprints size={16} className="text-blue-500" />}
                  {activity.type === 'medicine' && <Pill size={16} className="text-emerald-500" />}
                  {activity.type === 'bath' && <Bath size={16} className="text-sky-500" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    <span className="font-bold">{activity.userName}</span> {activity.action} <span className="font-bold">{activity.petName}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">{activity.time}</p>
                </div>
                <span className="text-xs font-bold text-green-500">+{activity.points} pts</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <BottomNav active="ranking" onNavigate={props.onNavigate} />
    </div>
  );
}

function PetsScreen(props: PetsScreenProps) {
  const [showAddPetForm, setShowAddPetForm] = useState(false);
  const [newPetName, setNewPetName] = useState('');
  const [newPetType, setNewPetType] = useState<Pet['type']>('dog');
  const [newPetBreed, setNewPetBreed] = useState('');
  const [newPetAge, setNewPetAge] = useState('');
  const [newPetStatus, setNewPetStatus] = useState<Pet['status']>('healthy');
  const [newPetClinicalNotes, setNewPetClinicalNotes] = useState('');
  const [newPetImageUrl, setNewPetImageUrl] = useState('');
  const [newPetUploadedImage, setNewPetUploadedImage] = useState<File | null>(null);
  const [newPetPreviewUrl, setNewPetPreviewUrl] = useState<string | null>(null);
  const [submittingPet, setSubmittingPet] = useState(false);

  const imagePreview = newPetPreviewUrl || newPetImageUrl;

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }

    setNewPetUploadedImage(file);
    if (newPetPreviewUrl) {
      URL.revokeObjectURL(newPetPreviewUrl);
    }
    setNewPetPreviewUrl(URL.createObjectURL(file));
  };

  const submitPet = async () => {
    if (!newPetName.trim()) {
      toast.error('Digite o nome do pet.');
      return;
    }

    setSubmittingPet(true);
    try {
      await props.onAddPet({
        name: newPetName,
        type: newPetType,
        breed: newPetBreed,
        age: newPetAge,
        status: newPetStatus,
        clinicalNotes: newPetClinicalNotes,
        imageUrl: newPetImageUrl,
        imageFile: newPetUploadedImage,
      });
      setNewPetName('');
      setNewPetType('dog');
      setNewPetBreed('');
      setNewPetAge('');
      setNewPetStatus('healthy');
      setNewPetClinicalNotes('');
      setNewPetImageUrl('');
      setNewPetUploadedImage(null);
      if (newPetPreviewUrl) {
        URL.revokeObjectURL(newPetPreviewUrl);
      }
      setNewPetPreviewUrl(null);
      setShowAddPetForm(false);
    } finally {
      setSubmittingPet(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar pb-24">
      <header className="sticky top-0 z-10 bg-background-dark/80 backdrop-blur-md border-b border-white/5 p-4 flex items-center justify-between">
        <button onClick={() => props.onNavigate('ranking')} className="p-2 text-slate-100"><ArrowLeft /></button>
        <h1 className="font-bold text-lg">Pets da Familia</h1>
        <button className="p-2 bg-primary/10 text-primary rounded-xl"><Search size={20} /></button>
      </header>

      <main className="p-4 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold">Seus Pets</h2>
          <button
            onClick={() => setShowAddPetForm((prev) => !prev)}
            className="flex items-center gap-2 bg-primary px-4 py-2 rounded-full text-white text-sm font-bold shadow-lg shadow-primary/20"
          >
            <Plus size={16} /> {showAddPetForm ? 'Fechar' : 'Adicionar'}
          </button>
        </div>

        {showAddPetForm && (
          <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Nome do pet</label>
            <input
              value={newPetName}
              onChange={(event) => setNewPetName(event.target.value)}
              placeholder="Ex: Bolinha"
              className="w-full h-12 bg-black/20 border border-white/10 rounded-xl px-4 focus:ring-2 focus:ring-primary outline-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Tipo</label>
                <select
                  value={newPetType}
                  onChange={(event) => setNewPetType(event.target.value as Pet['type'])}
                  className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="dog">Cachorro</option>
                  <option value="cat">Gato</option>
                  <option value="bird">Passaro</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</label>
                <select
                  value={newPetStatus}
                  onChange={(event) => setNewPetStatus(event.target.value as Pet['status'])}
                  className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="healthy">Saudavel</option>
                  <option value="vaccine-due">Vacina pendente</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Observacoes clinicas</label>
              <textarea
                value={newPetClinicalNotes}
                onChange={(event) => setNewPetClinicalNotes(event.target.value)}
                placeholder="Alergias, medicamentos, cuidados especiais..."
                className="w-full min-h-24 bg-black/20 border border-white/10 rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Raca</label>
                <input
                  value={newPetBreed}
                  onChange={(event) => setNewPetBreed(event.target.value)}
                  placeholder="Ex: SRD"
                  className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Idade</label>
                <input
                  value={newPetAge}
                  onChange={(event) => setNewPetAge(event.target.value)}
                  placeholder="Ex: 2 anos"
                  className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Foto do pet (URL)</label>
              <input
                value={newPetImageUrl}
                onChange={(event) => {
                  setNewPetImageUrl(event.target.value);
                  if (newPetUploadedImage) {
                    setNewPetUploadedImage(null);
                    if (newPetPreviewUrl) {
                      URL.revokeObjectURL(newPetPreviewUrl);
                      setNewPetPreviewUrl(null);
                    }
                  }
                }}
                placeholder="https://..."
                className="w-full h-11 bg-black/20 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Ou enviar imagem</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full text-xs text-slate-300 file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-primary/20 file:text-primary file:font-bold"
              />
            </div>

            {imagePreview && (
              <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20">
                <img src={imagePreview} alt="Preview do pet" className="w-full h-36 object-contain" referrerPolicy="no-referrer" />
              </div>
            )}

            <button
              disabled={submittingPet}
              onClick={submitPet}
              className="w-full h-11 rounded-xl bg-primary text-white font-bold disabled:opacity-60"
            >
              {submittingPet ? 'Salvando...' : 'Salvar pet'}
            </button>
          </div>
        )}

        <div className="space-y-6">
          {props.pets.length === 0 && (
            <div className="rounded-2xl p-6 bg-white/5 border border-white/10 text-center text-slate-400">
              Ainda nao ha pets cadastrados.
            </div>
          )}

          {props.pets.map((pet) => (
            <div
              key={pet.id}
              className="rounded-2xl overflow-hidden bg-white/5 border border-white/10 cursor-pointer"
              onClick={() => props.onOpenPetDetails(pet.id)}
            >
              <div className="relative aspect-video bg-black/30">
                <img src={pet.image} alt={pet.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                <div className="absolute top-3 right-3">
                  <span className={cn(
                    'px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 backdrop-blur-md',
                    pet.status === 'healthy' ? 'bg-green-500/90 text-white' : 'bg-amber-500/90 text-white'
                  )}>
                    {pet.status === 'healthy' ? <Check size={12} /> : <Calendar size={12} />}
                    {pet.status === 'healthy' ? 'Saudavel' : 'Vacina pendente'}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-primary text-[10px] font-bold uppercase tracking-widest">{pet.type}</p>
                    <h3 className="text-xl font-bold">{pet.name}</h3>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-slate-400 text-sm">
                  <PawPrint size={14} />
                  <span>{pet.breed} - {pet.age}</span>
                </div>
                {pet.clinicalNotes && (
                  <p className="mt-3 text-xs text-slate-400 line-clamp-2">{pet.clinicalNotes}</p>
                )}
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {props.members.slice(0, 4).map((member) => (
                      <div key={member.id} className="w-8 h-8 rounded-full border-2 border-background-dark overflow-hidden">
                        <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onOpenPetDetails(pet.id);
                    }}
                    className="px-4 py-1.5 bg-primary/10 text-primary rounded-lg text-sm font-bold"
                  >
                    Ver detalhes
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <BottomNav active="pets" onNavigate={props.onNavigate} />
    </div>
  );
}

function EditPetScreen(props: EditPetScreenProps) {
  const [name, setName] = useState(props.pet.name);
  const [type, setType] = useState<Pet['type']>(props.pet.type);
  const [breed, setBreed] = useState(props.pet.breed);
  const [age, setAge] = useState(props.pet.age);
  const [status, setStatus] = useState<Pet['status']>(props.pet.status);
  const [clinicalNotes, setClinicalNotes] = useState(props.pet.clinicalNotes || '');
  const [imageUrl, setImageUrl] = useState(props.pet.image);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }

    setImageFile(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      await props.onSave({
        name,
        type,
        breed,
        age,
        status,
        clinicalNotes,
        imageUrl,
        imageFile,
      });
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar pb-6">
      <header className="sticky top-0 z-10 bg-background-dark/90 backdrop-blur-md border-b border-white/5 p-4 flex items-center justify-between">
        <button onClick={props.onBack} className="p-2 text-slate-100"><ArrowLeft /></button>
        <h1 className="font-bold text-lg">Detalhes do Pet</h1>
        <div className="w-10" />
      </header>

      <main className="p-4 space-y-4">
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
          <img src={previewUrl || imageUrl || props.pet.image} alt={name} className="w-full h-56 object-contain" referrerPolicy="no-referrer" />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Nome</label>
          <input value={name} onChange={(event) => setName(event.target.value)} className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 focus:ring-2 focus:ring-primary outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Tipo</label>
            <select value={type} onChange={(event) => setType(event.target.value as Pet['type'])} className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none">
              <option value="dog">Cachorro</option>
              <option value="cat">Gato</option>
              <option value="bird">Passaro</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</label>
            <select value={status} onChange={(event) => setStatus(event.target.value as Pet['status'])} className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none">
              <option value="healthy">Saudavel</option>
              <option value="vaccine-due">Vacina pendente</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Raca</label>
            <input value={breed} onChange={(event) => setBreed(event.target.value)} className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Idade</label>
            <input value={age} onChange={(event) => setAge(event.target.value)} className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Foto (URL)</label>
          <input
            value={imageUrl}
            onChange={(event) => {
              setImageUrl(event.target.value);
              if (imageFile) {
                setImageFile(null);
                if (previewUrl) {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }
              }
            }}
            placeholder="https://..."
            className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-3 focus:ring-2 focus:ring-primary outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Ou enviar nova imagem</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="w-full text-xs text-slate-300 file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-primary/20 file:text-primary file:font-bold"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Observacoes clinicas</label>
          <textarea
            value={clinicalNotes}
            onChange={(event) => setClinicalNotes(event.target.value)}
            placeholder="Alergias, medicamentos, vacinas e observacoes importantes"
            className="w-full min-h-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary outline-none resize-none"
          />
        </div>

        <button
          disabled={submitting}
          onClick={onSubmit}
          className="w-full h-12 rounded-xl bg-primary text-white font-bold disabled:opacity-60"
        >
          {submitting ? 'Salvando...' : 'Salvar alteracoes'}
        </button>
      </main>
    </div>
  );
}

function TasksScreen(props: TasksScreenProps) {
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [selectedPetByTask, setSelectedPetByTask] = useState<Record<string, string>>({});

  const firstPet = props.pets[0] || null;

  const submitActivity = async (type: Activity['type'], label: string, points: number, action: string) => {
    try {
      await registerActivity(props.family.id, props.currentUser.id, firstPet?.id || null, type, action, points);
      await props.onRefresh();
      toast.success(`Atividade registrada: ${label} (+${points} pts)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao registrar atividade.';
      toast.error(message);
    }
  };

  const onAssign = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      await assignTask(taskId, props.currentUser.id);
      await props.onRefresh();
      toast.success('Tarefa assumida.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao assumir tarefa.';
      toast.error(message);
    } finally {
      setBusyTaskId(null);
    }
  };

  const onComplete = async (taskId: string) => {
    const task = props.tasks.find((item) => item.id === taskId);
    const selectedPetId = selectedPetByTask[taskId] || task?.petId || firstPet?.id;

    setBusyTaskId(taskId);
    try {
      await completeTask(taskId, props.currentUser.id, props.family.id, selectedPetId);
      await props.onRefresh();
      toast.success('Tarefa concluida! +20 pts');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao concluir tarefa.';
      toast.error(message);
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar pb-24">
      <header className="sticky top-0 z-10 bg-background-dark/80 backdrop-blur-md border-b border-white/5 p-4 flex items-center justify-between">
        <button className="p-2 text-primary"><Calendar size={24} /></button>
        <h1 className="font-bold text-lg">Tarefas</h1>
        <button onClick={() => props.onNavigate('notifications')} className="p-2 bg-primary/10 text-primary rounded-full"><Bell size={20} /></button>
      </header>

      <main className="p-4 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Registrar Atividade</h2>
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Ganhe Pontos</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ActivityButton icon={<PawPrint size={20} />} label="Alimentar" points={10} onClick={() => submitActivity('food', 'Alimentar', 10, 'alimentou')} />
            <ActivityButton icon={<Bath size={20} />} label="Banho" points={25} onClick={() => submitActivity('bath', 'Banho', 25, 'deu banho em')} />
            <ActivityButton icon={<Footprints size={20} />} label="Passear" points={15} onClick={() => submitActivity('walk', 'Passear', 15, 'passeou com')} />
            <ActivityButton icon={<Pill size={20} />} label="Remedio" points={20} onClick={() => submitActivity('medicine', 'Remedio', 20, 'deu remedio para')} />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Proximos Agendamentos</h2>
          </div>
          <div className="space-y-3">
            {props.tasks.length === 0 && <p className="text-slate-500 text-sm">Sem tarefas cadastradas ainda.</p>}
            {props.tasks.map((task) => (
              <div key={task.id} className={cn('flex items-center gap-4 p-4 rounded-xl border bg-white/5', task.day === 'tomorrow' ? 'opacity-60 border-white/5' : 'border-white/10')}>
                <div className="flex flex-col items-center pr-4 border-r border-white/10 min-w-[60px]">
                  <span className={cn('text-sm font-bold', task.day === 'today' ? 'text-primary' : 'text-slate-500')}>{task.time}</span>
                  <span className="text-[10px] uppercase font-bold text-slate-500">{task.day === 'today' ? 'Hoje' : 'Amanha'}</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-sm">{task.title} ({task.petName})</h3>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {task.assignedTo ? `Atribuido a: ${task.assignedTo}` : 'Nao atribuido'}
                  </span>
                  {props.pets.length > 0 && (
                    <div className="mt-2">
                      <label className="text-[10px] text-slate-400 mr-2">Pet da tarefa:</label>
                      <select
                        value={selectedPetByTask[task.id] || task.petId || props.pets[0].id}
                        onChange={(event) =>
                          setSelectedPetByTask((prev) => ({
                            ...prev,
                            [task.id]: event.target.value,
                          }))
                        }
                        className="h-7 bg-white/5 border border-white/10 rounded-md px-2 text-[10px] focus:ring-1 focus:ring-primary outline-none"
                      >
                        {props.pets.map((pet) => (
                          <option key={pet.id} value={pet.id}>
                            {pet.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {task.assignedTo ? (
                  <button
                    disabled={busyTaskId === task.id || task.completed}
                    onClick={() => onComplete(task.id)}
                    className="w-8 h-8 rounded-full border-2 border-primary/30 flex items-center justify-center text-primary/30 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                  >
                    <Check size={16} />
                  </button>
                ) : (
                  <button
                    disabled={busyTaskId === task.id}
                    onClick={() => onAssign(task.id)}
                    className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[10px] font-bold uppercase tracking-wider disabled:opacity-60"
                  >
                    Assumir
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      <BottomNav active="tasks" onNavigate={props.onNavigate} />
    </div>
  );
}

function FamilyProfileScreen(props: FamilyProfileScreenProps) {
  const completedCount = props.tasks.filter((task) => task.completed).length;

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(props.family.inviteCode);
      toast.success('Codigo copiado com sucesso.');
    } catch {
      toast.error('Nao foi possivel copiar o codigo.');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="p-4 flex items-center justify-between border-b border-white/5">
        <button onClick={() => props.onNavigate('ranking')} className="p-2 text-slate-100"><ArrowLeft /></button>
        <h2 className="font-bold text-lg">Familia</h2>
        <button onClick={props.onLogout} className="text-xs uppercase tracking-wider text-slate-300">Sair</button>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-24">
        <div className="flex flex-col items-center p-6">
          <div className="mt-4 text-center space-y-1">
            <h1 className="text-2xl font-bold">{props.family.name}</h1>
            <div className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full mx-auto w-fit">
              <span className="text-primary text-sm font-bold tracking-widest">{props.family.inviteCode}</span>
              <button onClick={copyInviteCode} className="text-primary" aria-label="Copiar codigo de convite">
                <Copy size={14} className="cursor-pointer" />
              </button>
            </div>
            <p className="text-slate-500 text-xs">Compartilhe o codigo para convidar novos membros.</p>
          </div>

          <div className="mt-6 w-full rounded-2xl bg-white/5 border border-white/10 p-4 flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary/30">
              <img src={props.currentUserAvatar} alt={props.currentUserName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs text-slate-400">Seu perfil</p>
              <p className="font-bold">{props.currentUserName}</p>
            </div>
            <button onClick={() => props.onNavigate('edit-profile')} className="px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-bold">
              Editar
            </button>
          </div>
        </div>

        <div className="px-4 flex gap-3">
          <StatCard icon={<Check size={18} />} label="Tarefas" value={String(completedCount)} trend={`${props.tasks.length} total`} />
          <StatCard icon={<Trophy size={18} />} label="Membros" value={String(props.members.length)} trend="ativos" />
        </div>

        <div className="mt-8 px-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg">Membros da Familia</h3>
            <span className="text-primary text-sm font-medium">{props.members.length} ativos</span>
          </div>
          <div className="space-y-3">
            {props.members.map((member) => (
              <div key={member.id} className="flex items-center p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className={cn('w-12 h-12 rounded-full overflow-hidden mr-3 border-2', member.role === 'admin' ? 'border-primary' : 'border-transparent')}>
                  <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-sm">{member.name}</h4>
                  <span className={cn('text-[8px] px-1.5 py-0.5 rounded font-bold uppercase', member.role === 'admin' ? 'bg-primary text-white' : 'bg-white/10 text-slate-400')}>
                    {member.role}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{member.points.toLocaleString()} pts</p>
                  <p className="text-[10px] text-slate-500">{member.tasksCompleted} tarefas</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BottomNav active="family" onNavigate={props.onNavigate} />
    </div>
  );
}

function NotificationsScreen(props: NotificationsScreenProps) {
  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar pb-24">
      <header className="sticky top-0 z-10 bg-background-dark/80 backdrop-blur-md border-b border-white/5 p-4 flex items-center justify-between">
        <button onClick={() => props.onNavigate('ranking')} className="p-2 text-slate-100"><ArrowLeft /></button>
        <h1 className="font-bold text-lg">Notificacoes</h1>
        <div className="w-10" />
      </header>

      <main className="p-4 space-y-3">
        {props.activities.length === 0 && (
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 text-center text-slate-400">
            Sem notificacoes por enquanto.
          </div>
        )}

        {props.activities.map((activity) => (
          <div key={activity.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              {activity.type === 'food' && <PawPrint size={16} className="text-primary" />}
              {activity.type === 'walk' && <Footprints size={16} className="text-blue-500" />}
              {activity.type === 'medicine' && <Pill size={16} className="text-emerald-500" />}
              {activity.type === 'bath' && <Bath size={16} className="text-sky-500" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">
                <span className="font-bold">{activity.userName}</span> {activity.action} <span className="font-bold">{activity.petName}</span>
              </p>
              <p className="text-[10px] text-slate-500">{activity.time}</p>
            </div>
            <span className="text-xs font-bold text-green-500">+{activity.points} pts</span>
          </div>
        ))}
      </main>

      <BottomNav active="ranking" onNavigate={props.onNavigate} />
    </div>
  );
}

function EditProfileScreen(props: EditProfileScreenProps) {
  const [name, setName] = useState(props.initialName);
  const [avatarUrl, setAvatarUrl] = useState(props.initialAvatar);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }

    setAvatarFile(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
  };

  const onSubmit = async () => {
    await props.onSave(name, avatarFile, avatarUrl);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto custom-scrollbar pb-8">
      <header className="sticky top-0 z-10 bg-background-dark/80 backdrop-blur-md border-b border-white/5 p-4 flex items-center justify-between">
        <button onClick={props.onBack} className="p-2 text-slate-100"><ArrowLeft /></button>
        <h1 className="font-bold text-lg">Editar Perfil</h1>
        <div className="w-10" />
      </header>

      <main className="p-4 space-y-5">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <div className="mx-auto w-28 h-28 rounded-full overflow-hidden border-2 border-primary/40">
            <img src={previewUrl || avatarUrl || props.initialAvatar} alt={name || 'Perfil'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <label className="mt-4 w-full h-10 rounded-xl bg-primary/15 text-primary text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
            <Camera size={16} /> Enviar foto
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </label>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Nome</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 focus:ring-2 focus:ring-primary outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Foto por URL (opcional)</label>
          <input
            value={avatarUrl}
            onChange={(event) => {
              setAvatarUrl(event.target.value);
              if (avatarFile) {
                setAvatarFile(null);
                if (previewUrl) {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }
              }
            }}
            placeholder="https://..."
            className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 focus:ring-2 focus:ring-primary outline-none"
          />
        </div>

        <button
          disabled={props.loading}
          onClick={onSubmit}
          className="w-full h-12 rounded-xl bg-primary text-white font-bold disabled:opacity-60"
        >
          {props.loading ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </main>
    </div>
  );
}

interface InputWithIconProps {
  icon: React.ReactNode;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}

function InputWithIcon({ icon, label, type = 'text', value, onChange }: InputWithIconProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-300">{label}</label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">{icon}</div>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full h-14 bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 focus:ring-2 focus:ring-primary outline-none"
        />
      </div>
    </div>
  );
}

interface SelectionCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  buttonText: string;
  onClick: () => void;
  primary?: boolean;
}

function SelectionCard({ title, description, icon, buttonText, onClick, primary }: SelectionCardProps) {
  return (
    <div className={cn('p-6 rounded-2xl bg-white/5 border border-white/10 relative overflow-hidden group', primary && 'border-primary/30')}>
      <div className={cn('absolute -right-8 -top-8 w-32 h-32 rounded-full blur-2xl transition-all', primary ? 'bg-primary/10 group-hover:bg-primary/20' : 'bg-white/5 group-hover:bg-primary/10')} />
      <div className="relative flex gap-5">
        <div className={cn('w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center', primary ? 'bg-primary/20 text-primary' : 'bg-white/10 text-slate-400')}>
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold mb-1">{title}</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">{description}</p>
          <button onClick={onClick} className={cn('w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95', primary ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/10 text-white')}>
            {buttonText} {primary && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
}

function StatCard({ icon, label, value, trend }: StatCardProps) {
  return (
    <div className="flex-1 p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
      <div className="flex items-center justify-between mb-1">
        <div className="text-primary">{icon}</div>
        <span className="text-emerald-500 text-[10px] font-bold">{trend}</span>
      </div>
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  );
}

interface ActivityButtonProps {
  icon: React.ReactNode;
  label: string;
  points: number;
  onClick: () => void;
}

function ActivityButton({ icon, label, points, onClick }: ActivityButtonProps) {
  return (
    <button onClick={onClick} className="flex flex-col items-start gap-3 p-4 rounded-xl border border-primary/20 bg-white/5 active:scale-95 transition-all text-left">
      <div className="w-10 h-10 bg-primary text-white rounded-lg flex items-center justify-center">{icon}</div>
      <div className="flex flex-col">
        <span className="font-bold">{label}</span>
        <span className="text-primary text-xs font-bold">+{points} pts</span>
      </div>
    </button>
  );
}

function BottomNav({ active, onNavigate }: { active: string; onNavigate: (s: Screen) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-background-dark/80 backdrop-blur-md border-t border-white/5 px-6 py-3 flex justify-between items-center z-50">
      <NavItem icon={<Home size={24} />} label="Inicio" active={active === 'ranking'} onClick={() => onNavigate('ranking')} />
      <NavItem icon={<PawPrint size={24} />} label="Pets" active={active === 'pets'} onClick={() => onNavigate('pets')} />
      <NavItem icon={<Calendar size={24} />} label="Tarefas" active={active === 'tasks'} onClick={() => onNavigate('tasks')} />
      <NavItem icon={<User size={24} />} label="Familia" active={active === 'family'} onClick={() => onNavigate('family-profile')} />
    </nav>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactElement<{ className?: string }>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex flex-col items-center gap-1 transition-colors', active ? 'text-primary' : 'text-slate-500')}>
      {React.cloneElement(icon, { className: active ? 'fill-primary' : '' })}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
