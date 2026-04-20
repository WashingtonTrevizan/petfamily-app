import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Activity, FamilyMember, Pet, Task } from '../types';
import { triggerFamilyPushNotification } from './pushNotifications';

export interface FamilyInfo {
  id: string;
  name: string;
  inviteCode: string;
}

export interface FamilyBundle {
  family: FamilyInfo;
  members: FamilyMember[];
  pets: Pet[];
  tasks: Task[];
  activities: Activity[];
}

export interface NewPetInput {
  name: string;
  type: Pet['type'];
  breed: string;
  age: string;
  status: Pet['status'];
  clinicalNotes?: string;
  imageUrl?: string;
  imageFile?: File | null;
}

export type UpdatePetInput = NewPetInput;

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200';
const DEFAULT_PET_IMAGE = 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&q=80&w=800';
const PET_IMAGES_BUCKET = 'pet-images';

async function uploadPetImage(familyId: string, userId: string, file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filePath = `${familyId}/${userId}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(PET_IMAGES_BUCKET).upload(filePath, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(PET_IMAGES_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function isMissingClinicalNotesColumn(errorMessage?: string) {
  if (!errorMessage) return false;
  const normalized = errorMessage.toLowerCase();
  return normalized.includes('column pets.clinical_notes does not exist');
}

function isMissingTaskPointsColumn(errorMessage?: string) {
  if (!errorMessage) return false;
  const normalized = errorMessage.toLowerCase();
  return normalized.includes('column tasks.reward_points does not exist');
}

function isToday(date: Date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(isoDate: string) {
  const current = Date.now();
  const eventTime = new Date(isoDate).getTime();
  const diffMinutes = Math.max(1, Math.floor((current - eventTime) / (1000 * 60)));

  if (diffMinutes < 60) {
    return `Ha ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Ha ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Ha ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
}

async function notifyFamilyPush(
  familyId: string,
  userId: string,
  title: string,
  body: string
) {
  try {
    await triggerFamilyPushNotification(familyId, title, body, userId);
  } catch {
    // Push e complementar: nao deve quebrar fluxo principal da acao.
  }
}

export async function ensureProfile(user: User, fullName?: string) {
  const name = fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Membro';

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        full_name: name,
      },
      { onConflict: 'id' }
    );

  if (error) {
    throw new Error(error.message);
  }
}

export async function getUserFamily(userId: string): Promise<FamilyInfo | null> {
  const { data: membership, error: membershipError } = await supabase
    .from('family_members')
    .select('family_id')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (membership) {
    const { data: family, error: familyError } = await supabase
      .from('families')
      .select('id, name, invite_code')
      .eq('id', membership.family_id)
      .maybeSingle();

    if (familyError) {
      throw new Error(familyError.message);
    }

    if (family) {
      return {
        id: family.id,
        name: family.name,
        inviteCode: family.invite_code,
      };
    }
  }

  // Fallback: user might be the family creator but membership row was removed.
  const { data: ownedFamily, error: ownedFamilyError } = await supabase
    .from('families')
    .select('id, name, invite_code')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ownedFamilyError) {
    throw new Error(ownedFamilyError.message);
  }

  if (!ownedFamily) {
    return null;
  }

  const { error: recoverMembershipError } = await supabase.from('family_members').upsert(
    {
      family_id: ownedFamily.id,
      user_id: userId,
      role: 'admin',
    },
    { onConflict: 'family_id,user_id' }
  );

  if (recoverMembershipError) {
    throw new Error(recoverMembershipError.message);
  }

  return {
    id: ownedFamily.id,
    name: ownedFamily.name,
    inviteCode: ownedFamily.invite_code,
  };
}

export async function createFamily(user: User, familyName: string) {
  if (!familyName.trim()) {
    throw new Error('Informe um nome para a familia.');
  }

  await ensureProfile(user);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const inviteCode = generateInviteCode();

    const { data: family, error: familyError } = await supabase
      .from('families')
      .insert({
        name: familyName.trim(),
        invite_code: inviteCode,
        created_by: user.id,
      })
      .select('id, name, invite_code')
      .single();

    if (familyError) {
      if (familyError.message.toLowerCase().includes('invite_code')) {
        continue;
      }
      throw new Error(familyError.message);
    }

    const { error: memberError } = await supabase.from('family_members').insert({
      family_id: family.id,
      user_id: user.id,
      role: 'admin',
    });

    if (memberError) {
      throw new Error(memberError.message);
    }

    return {
      id: family.id,
      name: family.name,
      inviteCode: family.invite_code,
    } satisfies FamilyInfo;
  }

  throw new Error('Nao foi possivel gerar um codigo de convite unico. Tente novamente.');
}

export async function joinFamily(user: User, inviteCode: string) {
  const formatted = inviteCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (formatted.length < 6) {
    throw new Error('Codigo invalido.');
  }

  await ensureProfile(user);

  const { data: family, error: familyError } = await supabase
    .from('families')
    .select('id, name, invite_code')
    .eq('invite_code', formatted)
    .maybeSingle();

  if (familyError) {
    throw new Error(familyError.message);
  }

  if (!family) {
    throw new Error('Familia nao encontrada com esse codigo.');
  }

  const { error: memberError } = await supabase.from('family_members').upsert(
    {
      family_id: family.id,
      user_id: user.id,
      role: 'member',
    },
    { onConflict: 'family_id,user_id' }
  );

  if (memberError) {
    throw new Error(memberError.message);
  }

  return {
    id: family.id,
    name: family.name,
    inviteCode: family.invite_code,
  } satisfies FamilyInfo;
}

export async function loadFamilyBundle(familyId: string): Promise<FamilyBundle> {
  const { data: family, error: familyError } = await supabase
    .from('families')
    .select('id, name, invite_code')
    .eq('id', familyId)
    .single();

  if (familyError) {
    throw new Error(familyError.message);
  }

  const { data: memberRows, error: memberError } = await supabase
    .from('family_members')
    .select('user_id, role')
    .eq('family_id', familyId);

  if (memberError) {
    throw new Error(memberError.message);
  }

  const memberIds = (memberRows || []).map((row) => row.user_id);

  let profiles: Array<{ id: string; full_name: string | null; avatar_url: string | null; points: number | null }> = [];
  if (memberIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, points')
      .in('id', memberIds);

    if (profileError) {
      throw new Error(profileError.message);
    }

    profiles = profileRows || [];
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const members: FamilyMember[] = (memberRows || []).map((member) => {
    const profile = profileById.get(member.user_id);
    return {
      id: member.user_id,
      name: profile?.full_name || 'Membro',
      role: member.role === 'admin' ? 'admin' : 'member',
      points: Number(profile?.points || 0),
      tasksCompleted: 0,
      avatar: profile?.avatar_url || DEFAULT_AVATAR,
    };
  });

  const { data: petRowsWithNotes, error: petError } = await supabase
    .from('pets')
    .select('id, name, type, breed, age, status, image_url, clinical_notes')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true });

  let petRows: Array<{
    id: string;
    name: string;
    type: Pet['type'];
    breed: string | null;
    age: string | null;
    status: Pet['status'];
    image_url: string | null;
    clinical_notes?: string | null;
  }> = (petRowsWithNotes as Array<{
    id: string;
    name: string;
    type: Pet['type'];
    breed: string | null;
    age: string | null;
    status: Pet['status'];
    image_url: string | null;
    clinical_notes?: string | null;
  }> | null) || [];
  if (petError) {
    if (!isMissingClinicalNotesColumn(petError.message)) {
      throw new Error(petError.message);
    }

    const { data: legacyPetRows, error: legacyPetError } = await supabase
      .from('pets')
      .select('id, name, type, breed, age, status, image_url')
      .eq('family_id', familyId)
      .order('created_at', { ascending: true });

    if (legacyPetError) {
      throw new Error(legacyPetError.message);
    }

    petRows = (legacyPetRows as Array<{
      id: string;
      name: string;
      type: Pet['type'];
      breed: string | null;
      age: string | null;
      status: Pet['status'];
      image_url: string | null;
      clinical_notes?: string | null;
    }> | null) || [];
  }

  const pets: Pet[] = (petRows || []).map((pet) => ({
    id: pet.id,
    name: pet.name,
    type: pet.type,
    breed: pet.breed || 'Sem raca',
    age: pet.age || 'Idade nao informada',
    status: pet.status === 'vaccine-due' ? 'vaccine-due' : 'healthy',
    image: pet.image_url || DEFAULT_PET_IMAGE,
    clinicalNotes: 'clinical_notes' in pet ? pet.clinical_notes || undefined : undefined,
    owners: members.map((member) => member.id),
  }));

  const petById = new Map(pets.map((pet) => [pet.id, pet]));

  const { data: taskRowsWithPoints, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, scheduled_at, assigned_to, pet_id, completed, reward_points')
    .eq('family_id', familyId)
    .order('scheduled_at', { ascending: true });

  let taskRows: Array<{
    id: string;
    title: string;
    scheduled_at: string;
    assigned_to: string | null;
    pet_id: string | null;
    completed: boolean;
    reward_points?: number | null;
  }> = (taskRowsWithPoints as Array<{
    id: string;
    title: string;
    scheduled_at: string;
    assigned_to: string | null;
    pet_id: string | null;
    completed: boolean;
    reward_points?: number | null;
  }> | null) || [];

  if (taskError) {
    if (!isMissingTaskPointsColumn(taskError.message)) {
      throw new Error(taskError.message);
    }

    const { data: legacyTaskRows, error: legacyTaskError } = await supabase
      .from('tasks')
      .select('id, title, scheduled_at, assigned_to, pet_id, completed')
      .eq('family_id', familyId)
      .order('scheduled_at', { ascending: true });

    if (legacyTaskError) {
      throw new Error(legacyTaskError.message);
    }

    taskRows = (legacyTaskRows as Array<{
      id: string;
      title: string;
      scheduled_at: string;
      assigned_to: string | null;
      pet_id: string | null;
      completed: boolean;
      reward_points?: number | null;
    }> | null) || [];
  }

  const tasks: Task[] = (taskRows || []).map((task) => {
    const date = new Date(task.scheduled_at);
    const assignedMember = members.find((member) => member.id === task.assigned_to);

    return {
      id: task.id,
      title: task.title,
      time: formatTime(date),
      day: isToday(date) ? 'today' : 'tomorrow',
      assignedTo: assignedMember?.name,
      petId: task.pet_id || undefined,
      petName: petById.get(task.pet_id)?.name || 'Pet',
      points: Number(task.reward_points ?? 20),
      completed: Boolean(task.completed),
    };
  });

  const completedByUser = new Map<string, number>();
  for (const task of taskRows || []) {
    if (task.completed && task.assigned_to) {
      completedByUser.set(task.assigned_to, (completedByUser.get(task.assigned_to) || 0) + 1);
    }
  }

  const membersWithTaskCount = members.map((member) => ({
    ...member,
    tasksCompleted: completedByUser.get(member.id) || 0,
  }));

  const { data: activityRows, error: activityError } = await supabase
    .from('activities')
    .select('id, user_id, pet_id, action, points, type, created_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })
    .limit(15);

  if (activityError) {
    throw new Error(activityError.message);
  }

  const memberById = new Map(membersWithTaskCount.map((member) => [member.id, member]));

  const activities: Activity[] = (activityRows || []).map((activity) => ({
    id: activity.id,
    userName: memberById.get(activity.user_id)?.name || 'Membro',
    action: activity.action,
    petName: petById.get(activity.pet_id)?.name || 'Pet',
    time: formatRelativeTime(activity.created_at),
    points: activity.points,
    type: activity.type,
  }));

  return {
    family: {
      id: family.id,
      name: family.name,
      inviteCode: family.invite_code,
    },
    members: membersWithTaskCount,
    pets,
    tasks,
    activities,
  };
}

export async function addPet(familyId: string, input: NewPetInput, createdBy: string) {
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error('Informe um nome para o pet.');
  }

  const breed = input.breed.trim() || 'Sem raca definida';
  const age = input.age.trim() || 'Ainda nao informado';
  const uploadedImageUrl = input.imageFile ? await uploadPetImage(familyId, createdBy, input.imageFile) : null;
  const imageUrl = uploadedImageUrl || input.imageUrl?.trim() || DEFAULT_PET_IMAGE;
  const clinicalNotes = input.clinicalNotes?.trim() || null;

  const petPayload = {
    family_id: familyId,
    name: cleanName,
    type: input.type,
    breed,
    age,
    status: input.status,
    image_url: imageUrl,
    clinical_notes: clinicalNotes,
    created_by: createdBy,
  };

  const { error } = await supabase.from('pets').insert(petPayload);

  if (error && isMissingClinicalNotesColumn(error.message)) {
    const { error: fallbackError } = await supabase.from('pets').insert({
      family_id: familyId,
      name: cleanName,
      type: input.type,
      breed,
      age,
      status: input.status,
      image_url: imageUrl,
      created_by: createdBy,
    });

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }

    return;
  }

  if (error) {
    throw new Error(error.message);
  }
}

export async function updatePet(petId: string, familyId: string, userId: string, input: UpdatePetInput) {
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error('Informe um nome para o pet.');
  }

  const breed = input.breed.trim() || 'Sem raca definida';
  const age = input.age.trim() || 'Ainda nao informado';
  const uploadedImageUrl = input.imageFile ? await uploadPetImage(familyId, userId, input.imageFile) : null;
  const imageUrl = uploadedImageUrl || input.imageUrl?.trim() || DEFAULT_PET_IMAGE;
  const clinicalNotes = input.clinicalNotes?.trim() || null;

  const updatePayload = {
    name: cleanName,
    type: input.type,
    breed,
    age,
    status: input.status,
    image_url: imageUrl,
    clinical_notes: clinicalNotes,
  };

  const { error } = await supabase
    .from('pets')
    .update(updatePayload)
    .eq('id', petId);

  if (error && isMissingClinicalNotesColumn(error.message)) {
    const { error: fallbackError } = await supabase
      .from('pets')
      .update({
        name: cleanName,
        type: input.type,
        breed,
        age,
        status: input.status,
        image_url: imageUrl,
      })
      .eq('id', petId);

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }

    return;
  }

  if (error) {
    throw new Error(error.message);
  }
}

export async function assignTask(taskId: string, userId: string) {
  const { error } = await supabase
    .from('tasks')
    .update({ assigned_to: userId })
    .eq('id', taskId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createTask(
  familyId: string,
  title: string,
  petId: string | null,
  scheduledAt: string,
  points: number
) {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    throw new Error('Informe o titulo da tarefa.');
  }

  const parsedPoints = Number(points);
  const rewardPoints = Number.isFinite(parsedPoints) ? Math.max(0, Math.floor(parsedPoints)) : 0;

  const { error } = await supabase.from('tasks').insert({
    family_id: familyId,
    pet_id: petId,
    title: cleanTitle,
    scheduled_at: scheduledAt,
    reward_points: rewardPoints,
  });

  if (error && isMissingTaskPointsColumn(error.message)) {
    const { error: fallbackError } = await supabase.from('tasks').insert({
      family_id: familyId,
      pet_id: petId,
      title: cleanTitle,
      scheduled_at: scheduledAt,
    });

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }

    return;
  }

  if (error) {
    throw new Error(error.message);
  }
}

export interface RoutineStepInput {
  title: string;
  points: number;
  offsetMinutes: number;
}

export async function createRoutineFlowTasks(
  familyId: string,
  petId: string | null,
  startAtIso: string,
  routineName: string,
  steps: RoutineStepInput[]
) {
  const cleanRoutineName = routineName.trim();
  if (!cleanRoutineName) {
    throw new Error('Informe o nome da rotina.');
  }

  if (!steps.length) {
    throw new Error('Adicione pelo menos um passo na rotina.');
  }

  const startAt = new Date(startAtIso);
  if (Number.isNaN(startAt.getTime())) {
    throw new Error('Data inicial da rotina invalida.');
  }

  const payload = steps.map((step, index) => {
    const cleanStepTitle = step.title.trim();
    if (!cleanStepTitle) {
      throw new Error(`Passo ${index + 1} sem titulo.`);
    }

    const safePoints = Number.isFinite(step.points) ? Math.max(0, Math.floor(step.points)) : 0;
    const safeOffset = Number.isFinite(step.offsetMinutes) ? Math.max(0, Math.floor(step.offsetMinutes)) : index;
    const scheduledAt = new Date(startAt.getTime() + safeOffset * 60_000).toISOString();

    return {
      family_id: familyId,
      pet_id: petId,
      title: `${cleanRoutineName} - ${cleanStepTitle}`,
      scheduled_at: scheduledAt,
      reward_points: safePoints,
    };
  });

  const { error } = await supabase.from('tasks').insert(payload);

  if (error && isMissingTaskPointsColumn(error.message)) {
    const fallbackPayload = payload.map(({ reward_points: _rewardPoints, ...task }) => task);
    const { error: fallbackError } = await supabase.from('tasks').insert(fallbackPayload);

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }

    return;
  }

  if (error) {
    throw new Error(error.message);
  }
}

export async function completeTask(taskId: string, userId: string, familyId: string, petId?: string) {
  let rewardPoints = 20;
  let resolvedPetId: string | null = petId || null;

  const { data: taskWithPoints, error: taskLookupError } = await supabase
    .from('tasks')
    .select('pet_id, reward_points')
    .eq('id', taskId)
    .maybeSingle();

  if (taskLookupError && !isMissingTaskPointsColumn(taskLookupError.message)) {
    throw new Error(taskLookupError.message);
  }

  if (taskLookupError && isMissingTaskPointsColumn(taskLookupError.message)) {
    const { data: legacyTask, error: legacyTaskError } = await supabase
      .from('tasks')
      .select('pet_id')
      .eq('id', taskId)
      .maybeSingle();

    if (legacyTaskError) {
      throw new Error(legacyTaskError.message);
    }

    if (!resolvedPetId && legacyTask?.pet_id) {
      resolvedPetId = legacyTask.pet_id;
    }
  } else {
    if (!resolvedPetId && taskWithPoints?.pet_id) {
      resolvedPetId = taskWithPoints.pet_id;
    }
    rewardPoints = Number(taskWithPoints?.reward_points ?? 20);
  }

  const { error: taskError } = await supabase
    .from('tasks')
    .update({
      completed: true,
      assigned_to: userId,
      completed_by: userId,
      completed_at: new Date().toISOString(),
      pet_id: resolvedPetId,
    })
    .eq('id', taskId);

  if (taskError) {
    throw new Error(taskError.message);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('points')
    .eq('id', userId)
    .single();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const { error: pointsError } = await supabase
    .from('profiles')
    .update({ points: Number(profile.points || 0) + rewardPoints })
    .eq('id', userId);

  if (pointsError) {
    throw new Error(pointsError.message);
  }

  const { error: activityError } = await supabase.from('activities').insert({
    family_id: familyId,
    pet_id: resolvedPetId || null,
    user_id: userId,
    action: 'concluiu tarefa para',
    points: rewardPoints,
    type: 'food',
  });

  if (activityError) {
    throw new Error(activityError.message);
  }

  await notifyFamilyPush(
    familyId,
    userId,
    'Tarefa concluida no PetFamily',
    `Uma tarefa foi concluida e gerou +${rewardPoints} pts.`
  );
}

export async function registerActivity(
  familyId: string,
  userId: string,
  petId: string | null,
  type: Activity['type'],
  action: string,
  points: number
) {
  const { error: activityError } = await supabase.from('activities').insert({
    family_id: familyId,
    pet_id: petId,
    user_id: userId,
    action,
    points,
    type,
  });

  if (activityError) {
    throw new Error(activityError.message);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('points')
    .eq('id', userId)
    .single();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const { error: pointsError } = await supabase
    .from('profiles')
    .update({ points: Number(profile.points || 0) + points })
    .eq('id', userId);

  if (pointsError) {
    throw new Error(pointsError.message);
  }

  await notifyFamilyPush(
    familyId,
    userId,
    'Nova atividade no PetFamily',
    `Uma atividade foi registrada e gerou +${points} pts.`
  );
}
