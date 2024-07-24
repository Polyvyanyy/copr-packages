%global commit 11271760052c4a4a4057f2d287944d74e8fbdb58
%global shortcommit %(c=%{commit}; echo ${c:0:7})
%global git_rel .git%{shortcommit}
%global origname SwayOSD

Name:           swayosd
Version:		0.1.0
Release:		1%{?git_rel}%{?dist}
Summary:		A GTK based on screen display for keyboard shortcuts like caps-lock and volume.
License:		GPL-3.0
Group:          Productivity

Url:			https://github.com/ErikReider/SwayOSD
Source:			%{url}/archive/%{commit}/%{name}-main-%{commit}.tar.gz
Source1:		swayosd-%{commit}-vendor.tar.xz
Source2:		swayosd.sysusers
# Makefile to make vendor tar.xz
Source3:		Makefile

BuildRequires:	rust
BuildRequires:	cargo
BuildRequires:	cargo-rpm-macros >= 25
BuildRequires:	meson
BuildRequires:	gtk3-devel
BuildRequires:	glib2-devel
BuildRequires:	sassc
BuildRequires:	libudev-devel
BuildRequires:	libevdev-devel
BuildRequires:	atk-devel
BuildRequires:	cairo-gobject-devel
BuildRequires:	gtk-layer-shell-devel
BuildRequires:	libinput-devel
BuildRequires:	pulseaudio-libs
BuildRequires:	systemd-rpm-macros
BuildRequires:	systemd

%description
A OSD window for common actions like volume and capslock.
This is my first time coding in Rust so fixes and improvements are appreciated :)

%prep
%autosetup -n %{origname}-%{commit} -p1 -a1
%cargo_prep -v vendor


%build
%meson
%meson_build
%{cargo_license_summary}
%{cargo_license} > LICENSE.dependencies
%{cargo_vendor_manifest}

%install
%meson_install
rm %{buildroot}/usr/share/licenses/swayosd/LICENSE
#mkdir -p %{buildroot}%{_unitdir}
#mv %{buildroot}%{_libdir}/systemd/system/swayosd-libinput-backend.service %{buildroot}%{_unitdir}/swayosd-libinput-backend.service

%pre
%sysusers_create_compat %{SOURCE2}

%files
%doc LICENSE LICENSE.dependencies
%{_bindir}/swayosd-client
%{_bindir}/swayosd-libinput-backend
%{_bindir}/swayosd-server
%{_sysconfdir}/xdg/swayosd/style.css
%{_unitdir}/swayosd-libinput-backend.service
%{_libdir}/udev/rules.d/99-swayosd.rules
%{_datadir}/dbus-1/system-services/org.erikreider.swayosd.service
%{_datadir}/dbus-1/system.d/org.erikreider.swayosd.conf
%{_datadir}/polkit-1/actions/org.erikreider.swayosd.policy
%{_datadir}/polkit-1/rules.d/org.erikreider.swayosd.rules

%changelog
* Tue Jul 23 2024 Ilya Polyvyanyy <ilia.polyvyanyy@red-soft.ru> - 0.1.0-1.git1127176
- init build with vendor
