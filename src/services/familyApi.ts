import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Activity, FamilyMember, Pet, Task } from '../types';

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
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (!membership) {
    return null;
  }

  const { data: family, error: familyError } = await supabase
    .from('families')
    .select('id, name, invite_code')
    .eq('id', membership.family_id)
    .single();

  if (familyError) {
    throw new Error(familyError.message);
  }

  return {
    id: family.id,
    name: family.name,
    inviteCode: family.invite_code,
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
  const formatted = inviteCode.trim().toUpperCase();

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

  const { data: petRows, error: petError } = await supabase
    .from('pets')
    .select('id, name, type, breed, age, status, image_url, clinical_notes')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true });

  if (petError) {
    throw new Error(petError.message);
  }

  const pets: Pet[] = (petRows || []).map((pet) => ({
    id: pet.id,
    name: pet.name,
    type: pet.type,
    breed: pet.breed || 'Sem raca',
    age: pet.age || 'Idade nao informada',
    status: pet.status === 'vaccine-due' ? 'vaccine-due' : 'healthy',
    image: pet.image_url || DEFAULT_PET_IMAGE,
    clinicalNotes: pet.clinical_notes || undefined,
    owners: members.map((member) => member.id),
  }));

  const petById = new Map(pets.map((pet) => [pet.id, pet]));

  const { data: taskRows, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, scheduled_at, assigned_to, pet_id, completed')
    .eq('family_id', familyId)
    .order('scheduled_at', { ascending: true });

  if (taskError) {
    throw new Error(taskError.message);
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
      petName: petById.get(task.pet_id)?.name || 'Pet',
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

  const { error } = await supabase.from('pets').insert({
    family_id: familyId,
    name: cleanName,
    type: input.type,
    breed,
    age,
    status: input.status,
    image_url: imageUrl,
    clinical_notes: clinicalNotes,
    created_by: createdBy,
  });

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

  const { error } = await supabase
    .from('pets')
    .update({
      name: cleanName,
      type: input.type,
      breed,
      age,
      status: input.status,
      image_url: imageUrl,
      clinical_notes: clinicalNotes,
    })
    .eq('id', petId);

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

export async function completeTask(taskId: string, userId: string, familyId: string, petId?: string) {
  const { error: taskError } = await supabase
    .from('tasks')
    .update({
      completed: true,
      completed_by: userId,
      completed_at: new Date().toISOString(),
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
    .update({ points: Number(profile.points || 0) + 20 })
    .eq('id', userId);

  if (pointsError) {
    throw new Error(pointsError.message);
  }

  const { error: activityError } = await supabase.from('activities').insert({
    family_id: familyId,
    pet_id: petId || null,
    user_id: userId,
    action: 'concluiu tarefa para',
    points: 20,
    type: 'food',
  });

  if (activityError) {
    throw new Error(activityError.message);
  }
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
}
